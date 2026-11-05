import React from "react";

/**
 * Shared page shell: board on the left (fills the space, cells scale to fit),
 * control panel on the right. On small screens the panel sits between the
 * title and the board.
 */
function BoardLayout({ title, subtitle, board, panel }) {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="text-center mb-6">
                <h1 className="text-forest-900">{title}</h1>
                {subtitle && <p className="text-moss-700 mt-2">{subtitle}</p>}
            </div>
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <section className="order-2 lg:order-1 w-full flex-1 min-w-0 bg-cream-50 border border-sage-200 rounded-2xl shadow-sm p-4">
                    {board}
                </section>
                <aside className="order-1 lg:order-2 w-full lg:w-80 shrink-0 flex flex-col gap-4 lg:sticky lg:top-24">
                    {panel}
                </aside>
            </div>
        </div>
    );
}

export function Panel({ title, children }) {
    return (
        <div className="bg-cream-50 border border-sage-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            {title && <h2 className="text-xl font-semibold text-forest-900">{title}</h2>}
            {children}
        </div>
    );
}

export function Field({ label, htmlFor, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            {htmlFor ? (
                <label htmlFor={htmlFor} className="text-sm font-medium text-moss-700">{label}</label>
            ) : (
                <span className="text-sm font-medium text-moss-700">{label}</span>
            )}
            {children}
        </div>
    );
}

export function Segmented({ label, options, value, onChange }) {
    return (
        <div role="group" aria-label={label} className="flex rounded-full border border-sage-400 bg-cream-50 p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                        value === o.value ? "bg-moss-600 text-cream-50" : "text-forest-800 hover:bg-sage-100"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export default BoardLayout;
