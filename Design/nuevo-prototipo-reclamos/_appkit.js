/* _appkit.js — shell del Agente (sidebar navy + header) y Avatar.
   Reutilizado por las pantallas del agente. Requiere _boot.js + _ds_bundle*. */
(function () {
  const h = React.createElement;
  const Icon = window.Proto.Icon;

  function Avatar(props) {
    const initials = String(props.name || '').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    const size = props.size || 36;
    return h('span', { style: { width: size, height: size, borderRadius: 'var(--radius-full)', background: props.onDark ? 'rgba(255,255,255,0.16)' : 'var(--primary-100)', color: props.onDark ? '#FFFFFF' : 'var(--primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.4), fontFamily: 'var(--font-sans)', flexShrink: 0, letterSpacing: '0.01em' } }, initials);
  }

  function AgentShell(props) {
    const DS = window.AmparoDesignSystem_70b626;
    const items = [
      { id: 'casos', label: 'Casos activos', icon: h(Icon, { name: 'briefcase', size: 18 }), count: props.casosCount },
      { id: 'venc', label: 'Vencimientos', icon: h(Icon, { name: 'clock', size: 18 }) },
      { id: 'cerrados', label: 'Casos cerrados', icon: h(Icon, { name: 'check', size: 18 }) }
    ];
    const footer = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h(Avatar, { name: props.agent || 'Lucía Fernández', onDark: true, size: 34 }),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: '13px', fontWeight: 600, color: 'var(--sidebar-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, props.agent || 'Lucía Fernández'),
        h('div', { style: { fontSize: '11px', color: 'var(--sidebar-text)', opacity: 0.8 } }, 'Gestora de siniestros')),
      h('button', { type: 'button', 'aria-label': 'Salir', style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-text)', padding: 4, lineHeight: 0, flexShrink: 0 } }, h(Icon, { name: 'logout', size: 18 })));
    return h('div', { style: { display: 'flex', height: '100%', minHeight: '100%' } },
      h(DS.Sidebar, { brand: 'Amparo', items: items, activeId: props.activeId || 'casos', footer: footer }),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-page)' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '0 28px', height: '68px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 } },
          h('div', { style: { minWidth: 0 } },
            h('h1', { style: { margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-h3-size)', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' } }, props.title),
            props.subtitle && h('p', { style: { margin: '2px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' } }, props.subtitle)),
          props.actions && h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 } }, props.actions)),
        h('div', { style: { flex: 1, overflow: 'auto', padding: props.pad === false ? 0 : '26px 28px' } }, props.children)));
  }

  Object.assign(window.Proto, { Avatar: Avatar, AgentShell: AgentShell });
})();
