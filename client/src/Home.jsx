import React from "react";

function Section({ title, children }) {
  return (
    <section className="bg-cream-50 border border-sage-200 rounded-2xl shadow-sm p-8">
      <h2 className="text-2xl font-display text-forest-900 mb-4">{title}</h2>
      <div className="space-y-4 text-forest-800 leading-7 text-[15px]">{children}</div>
    </section>
  );
}

function FeatureCard({ title, children }) {
  return (
    <div className="bg-sage-50 border border-sage-200 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-forest-900 mb-3">{title}</h3>
      <div className="text-forest-800 leading-7 text-[15px] space-y-3">{children}</div>
    </div>
  );
}

function Home() {
  return (
    <main className="min-h-screen bg-sage-50 text-forest-900">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <section className="space-y-6 mb-10">
        <div className="bg-cream-50 border border-sage-200 rounded-3xl shadow-sm p-8 md:p-10">
            <p className="uppercase tracking-[0.2em] text-sm text-moss-700 mb-4">
            Knot Mosaic Project
            </p>
            <h1 className="text-4xl md:text-5xl font-display text-forest-900 leading-tight mb-6">
            Exploring knot mosaics, strategy, and computation
            </h1>
            <p className="text-forest-800 text-lg leading-8 max-w-3xl mx-auto text-center mb-6">
            This application introduces knot mosaics as a discrete way to represent knot diagrams,
            while also providing an interactive space to create mosaics and play the
            knotting&ndash;unknotting game. Our work explores the intersection of knot theory,
            computation, and mathematical experimentation.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="border border-sage-200 rounded-xl p-4 bg-sage-50">
                <p className="text-moss-700 mb-1">Focus</p>
                <p className="font-medium text-forest-900">Knot theory and computation</p>
            </div>
            <div className="border border-sage-200 rounded-xl p-4 bg-sage-50">
                <p className="text-moss-700 mb-1">Tools</p>
                <p className="font-medium text-forest-900">Mosaic maker and game board</p>
            </div>
            <div className="border border-sage-200 rounded-xl p-4 bg-sage-50">
                <p className="text-moss-700 mb-1">Question</p>
                <p className="font-medium text-forest-900">Can play suggest new mathematics?</p>
            </div>
            </div>
        </div>

        <aside className="bg-forest-800 text-cream-50 rounded-3xl p-8 shadow-sm text-center mx-auto">
        <p className="uppercase tracking-[0.18em] text-xs text-sage-200 mb-3">
            Current Motivation
        </p>
        <p className="text-lg leading-8 max-w-2xl mx-auto">
            We are interested in whether playing this game can help identify a nontrivial knot
            with Jones polynomial 1, potentially offering evidence toward a new conjectural
            direction beyond the cases verified today.
        </p>
        </aside>
        </section>

        <div className="grid gap-8">
          <Section title="What are knot mosaics?">
            <p>
              A knot is a simple closed curve in three-dimensional space. Because knots are often
              easier to study through two-dimensional projections, mathematicians use knot diagrams
              to record where strands cross over and under each other.
            </p>
            <p>
              Knot mosaics provide a discrete representation of these diagrams. A mosaic is built
              from a fixed collection of tiles arranged in a grid, where each tile contributes a
              local piece of the overall diagram. When the tiles are suitably connected, the grid
              represents a knot or link. This makes knot diagrams easier to encode, manipulate, and
              study computationally.
            </p>
          </Section>

          <Section title="Who we are and why we built this application">
            <p>
              We are a student research team interested in using computation to investigate ideas in
              knot theory. This application grew out of a broader effort to study the
              knotting&ndash;unknotting game, represent knot diagrams through mosaics, and explore how
              machine learning and interactive tools can support mathematical discovery.
            </p>
            <p>
              Our motivation has evolved from building a playable and computationally meaningful
              environment toward a deeper mathematical question: whether the game can help uncover a
              nontrivial knot whose Jones polynomial is 1. For knot diagrams with fewer than 25
              crossings, a verified result tells us that having Jones polynomial 1 is equivalent to
              being the unknot. We are interested in whether experimentation through gameplay and
              computation can point toward new patterns beyond that range.
            </p>
          </Section>

          <Section title="Explore the application">
            <div className="grid md:grid-cols-2 gap-6">
              <FeatureCard title="Knot Mosaic Maker">
                <p>
                  The Knot Mosaic Maker allows users to construct and edit mosaics directly on a
                  grid.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Choose the number of rows and columns</li>
                  <li>Click a cell to change its tile</li>
                  <li>Import an existing mosaic</li>
                  <li>Export a mosaic for later use or sharing</li>
                </ul>
              </FeatureCard>

              <FeatureCard title="Knotting&ndash;Unknotting Game">
                <p>
                  The game is currently designed for two players competing with opposite goals: one
                  attempts to create a knot, while the other attempts to keep the diagram trivial.
                </p>
                <p>
                  We are also developing a mode in which a player can compete against an AI agent,
                  extending the project toward reinforcement learning and strategy analysis.
                </p>
              </FeatureCard>
            </div>
          </Section>

          <Section title="Rules of the knotting&ndash;unknotting game">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="border border-sage-200 rounded-2xl p-6 bg-sage-50">
                <h3 className="font-semibold text-forest-900 mb-3">Setup</h3>
                <p>
                  The game begins with a knot shadow represented as a mosaic containing unresolved
                  crossings. Two players are assigned opposing roles: the Knotter and the
                  Unknotter.
                </p>
              </div>
              <div className="border border-sage-200 rounded-2xl p-6 bg-sage-50">
                <h3 className="font-semibold text-forest-900 mb-3">Gameplay</h3>
                <p>
                  Players alternate turns. On each turn, a player resolves one crossing by choosing
                  how that crossing is completed. Play continues until every unresolved crossing has
                  been assigned.
                </p>
              </div>
              <div className="border border-sage-200 rounded-2xl p-6 bg-sage-50">
                <h3 className="font-semibold text-forest-900 mb-3">Outcome</h3>
                <p>
                  Once all crossings are resolved, the resulting diagram is classified. If it is a
                  nontrivial knot, the Knotter wins. If it is the unknot, the Unknotter wins.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

export default Home;
