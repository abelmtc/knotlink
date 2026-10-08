# Run only against a local backend explicitly started with MONGODB_DB=knotlink_onboarding.
import os
if os.environ.get('KNOTLINK_ONBOARDING_SMOKE') != '1':
    raise SystemExit('Confirm the local backend uses knotlink_onboarding, then set KNOTLINK_ONBOARDING_SMOKE=1.')

import requests
from pymongo import MongoClient

base = 'http://127.0.0.1:5000/api'
board = [[0,2,1,0],[2,-1,-1,1],[3,-1,8,4],[0,3,4,0]]
assert requests.get(base+'/health', timeout=5).json()['status'] == 'healthy'
page = requests.get('http://127.0.0.1:5173/knotting', timeout=5)
page.raise_for_status()
assert '/src/main.jsx' in page.text
classifier = requests.get('http://127.0.0.1:5001/api/health', timeout=10)
classifier.raise_for_status()
assert classifier.json()['sage_available'] is True
response = requests.post(base+'/game/new', json={'board':board,'starting_player':'knotter'}, timeout=5)
assert response.status_code == 201, response.text
game_id = response.json()['game_id']
collection = MongoClient('mongodb://localhost:27017/')['knotlink_onboarding']['games']
try:
    for row, col, tile in [(1,1,9),(1,2,10),(2,1,10)]:
        response = requests.post(f'{base}/game/{game_id}/move',json={'row':row,'col':col,'new_tile':tile},timeout=5)
        response.raise_for_status()
    assert response.json()['status']['game_over'] is True
    result = requests.post(f'{base}/game/{game_id}/classify', timeout=30)
    result.raise_for_status()
    data = result.json()
    assert data['classification']['reason'] == 'jones_polynomial', data
    assert data['classification']['is_unknot'] is False, data
    assert data['winner'] == 'knotter', data
    saved = collection.find_one({'game_id':game_id})
    assert saved is not None
    assert saved['initial_board'] == board
    assert saved['starting_player'] == 'knotter'
    assert len(saved['move_sequence']) == 3
    assert saved['winner'] == 'knotter'
    assert saved['jones_polynomial'] is not None
    repeat = requests.post(f'{base}/game/{game_id}/classify', timeout=30)
    repeat.raise_for_status()
    assert collection.count_documents({'game_id':game_id}) == 1
    stats = requests.get(base+'/research/stats',timeout=5)
    stats.raise_for_status()
    assert stats.json()['total_games'] >= 1
    print('PASS: frontend route; API health; classifier health; three moves; trefoil classification; winner; MongoDB result and move history; repeat classification upserts one record; research stats')
finally:
    requests.delete(f'{base}/game/{game_id}', timeout=5)
    collection.delete_one({'game_id':game_id})
