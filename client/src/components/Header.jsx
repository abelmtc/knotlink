import { NavLink, useNavigate } from 'react-router-dom';

const links = [
    { to: '/mosaic-maker', label: 'Mosaic Maker' },
    { to: '/knotting', label: 'Knotting–Unknotting Game' },
];

function Header({ refFunc }) {
    const navigate = useNavigate();

    return (
        <header className='w-full sticky top-0 z-50 bg-cream-50/95 backdrop-blur border-b border-sage-200 shadow-sm'>
            <div className='max-w-6xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2'>
                <button
                    className='flex items-center gap-3 !border-0 !p-0 bg-transparent hover:!bg-transparent cursor-pointer'
                    onClick={() => { navigate('/'); refFunc(); }}
                    aria-label='Knot Games home'
                >
                    <span className='bg-[url(/images/trefoil.jpg)] bg-cover bg-center w-11 h-11 rounded-full border-2 border-moss-600'></span>
                    <span className='font-display text-3xl font-semibold text-forest-900'>Knot Games</span>
                </button>

                <nav className='flex flex-wrap gap-2 sm:ml-auto'>
                    {links.map(({ to, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            onClick={refFunc}
                            className={({ isActive }) =>
                                `px-4 py-1.5 rounded-full !no-underline text-base transition-colors ${
                                    isActive
                                        ? 'bg-moss-600 !text-cream-50'
                                        : 'text-forest-800 hover:bg-sage-100'
                                }`
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </div>
        </header>
    );
}

export default Header;
