interface ShowcaseProject {
  index: string;
  figureCode: string;
  scale: string;
  title: string;
  summary: string;
  meta: string[];
  colSpan: string;
}

const SHOWCASE_PROJECTS: ShowcaseProject[] = [
  {
    index: '01',
    figureCode: 'FIG. 01-A',
    scale: 'SCALE 1:250',
    title: '01. Isogrid Cantilever Truss',
    summary:
      'Long-span triangulated aluminum deck engineered for low-drag crosswind shear damping across elevated transit corridors.',
    meta: ['42.0 m clear span', '±0.12 mm tolerance', 'Modal damping 4.8%'],
    colSpan: 'lg:col-span-7',
  },
  {
    index: '02',
    figureCode: 'FIG. 02-B',
    scale: 'SCALE 1:100',
    title: '02. Laminar Intake Diffuser',
    summary:
      'Concentric guide-vane manifold stabilizing turbulent boundary layers into uniform pressure plenums without acoustic resonance.',
    meta: ['12-vane radial array', 'Pressure recovery 94.2%', 'Mach 0.24 rating'],
    colSpan: 'lg:col-span-5',
  },
  {
    index: '03',
    figureCode: 'FIG. 03-C',
    scale: 'SCALE 1:50',
    title: '03. Orthogonal Busbar Lattice',
    summary:
      'High-density thermal-structural routing plane pairing passive convective channels with deterministic electromagnetic isolation.',
    meta: ['8-layer copper bus', 'ΔT 11.4 °C peak', 'Zero-skew topology'],
    colSpan: 'lg:col-span-5',
  },
  {
    index: '04',
    figureCode: 'FIG. 04-D',
    scale: 'SCALE 1:500',
    title: '04. Geodesic Containment Vault',
    summary:
      'Double-shell hexagonal pressure enclosure validated against multi-axis vortex shedding and seismic shear harmonics.',
    meta: ['18.6 m radius', '3.4 bar differential', 'Hex-triangulated skin'],
    colSpan: 'lg:col-span-7',
  },
];

export function ShowcaseCards() {
  return (
    <section
      id="schematics"
      aria-labelledby="schematics-heading"
      className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline dark:border-obsidian-hairline"
    >
      <div className="mb-12 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
        <div className="lg:col-span-7 bg-paper/86 dark:bg-obsidian/86 p-6 border border-hairline dark:border-obsidian-hairline">
          <p className="font-mono text-xs text-blueprint dark:text-blueprint-cyan mb-2">
            Structural Elevations · DOM-Synced Fluid Quads
          </p>
          <h2
            id="schematics-heading"
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink dark:text-obsidian-ink"
          >
            Four reference assemblies coupled to the live velocity field
          </h2>
        </div>
        <div className="lg:col-span-5 bg-paper/86 dark:bg-obsidian/86 p-6 border border-hairline dark:border-obsidian-hairline">
          <p className="text-sm leading-relaxed text-ink-muted dark:text-obsidian-muted">
            Each elevation viewport below is tracked via ResizeObserver and projected directly into
            the fragment shader. Sweep across any frame or scroll to observe fluid shear inertia
            along the drafting plane.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {SHOWCASE_PROJECTS.map((project, idx) => (
          <article
            key={project.index}
            className={`${project.colSpan} flex flex-col border border-hairline dark:border-obsidian-hairline bg-transparent`}
          >
            {/* Transparent WebGL-synced schematic aperture */}
            <div
              data-fluid-quad={idx}
              data-testid={`fluid-quad-${idx}`}
              className="relative h-60 sm:h-72 w-full bg-transparent border-b border-hairline dark:border-obsidian-hairline"
            >
              <div className="pointer-events-none absolute top-3 left-3 px-2 py-0.5 bg-paper/88 dark:bg-obsidian/88 border border-hairline dark:border-obsidian-hairline font-mono text-[11px] text-ink dark:text-obsidian-ink tabular-nums">
                {project.figureCode}
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3 px-2 py-0.5 bg-paper/88 dark:bg-obsidian/88 border border-hairline dark:border-obsidian-hairline font-mono text-[11px] text-ink-muted dark:text-obsidian-muted tabular-nums">
                {project.scale}
              </div>
            </div>

            {/* Legible editorial caption block with clean surface backing */}
            <div className="flex flex-1 flex-col justify-between gap-4 p-6 bg-paper/90 dark:bg-obsidian/90">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-ink dark:text-obsidian-ink">
                  {project.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted dark:text-obsidian-muted">
                  {project.summary}
                </p>
              </div>
              <div className="pt-3 border-t border-hairline dark:border-obsidian-hairline flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-ink-muted dark:text-obsidian-muted tabular-nums">
                {project.meta.map((item, metaIdx) => (
                  <span key={item} className="inline-flex items-center gap-2.5">
                    {metaIdx > 0 && <span aria-hidden="true">·</span>}
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
