/* _boot.js — helpers de prototipo (frames, marca, iconos) para Nuevo prototipo Reclamos.
   Requiere React + ReactDOM globales y styles.css + proto.css. Expone window.Proto. */
(function () {
  const h = React.createElement;

  const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const PATHS = {
    mail: [['rect',{x:2,y:4,width:20,height:16,rx:2}],['path',{d:'M22 7l-10 6L2 7'}]],
    lock: [['rect',{x:3,y:11,width:18,height:11,rx:2}],['path',{d:'M7 11V7a5 5 0 0 1 10 0v4'}]],
    eye: [['path',{d:'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z'}],['circle',{cx:12,cy:12,r:3}]],
    eyeOff: [['path',{d:'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'}],['path',{d:'M1 1l22 22'}]],
    search: [['circle',{cx:11,cy:11,r:8}],['path',{d:'M21 21l-4.35-4.35'}]],
    plus: [['path',{d:'M12 5v14M5 12h14'}]],
    bell: [['path',{d:'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'}],['path',{d:'M13.73 21a2 2 0 0 1-3.46 0'}]],
    chevronRight: [['path',{d:'M9 18l6-6-6-6'}]],
    chevronDown: [['path',{d:'M6 9l6 6 6-6'}]],
    arrowLeft: [['path',{d:'M19 12H5M12 19l-7-7 7-7'}]],
    check: [['path',{d:'M20 6L9 17l-5-5'}]],
    checkCircle: [['path',{d:'M22 11.08V12a10 10 0 1 1-5.93-9.14'}],['path',{d:'M22 4 12 14.01l-3-3'}]],
    clock: [['circle',{cx:12,cy:12,r:10}],['path',{d:'M12 6v6l4 2'}]],
    alert: [['path',{d:'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'}],['path',{d:'M12 9v4'}],['path',{d:'M12 17h.01'}]],
    file: [['path',{d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}],['path',{d:'M14 2v6h6'}]],
    upload: [['path',{d:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'}],['path',{d:'M17 8l-5-5-5 5'}],['path',{d:'M12 3v12'}]],
    folder: [['path',{d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'}]],
    home: [['path',{d:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'}],['path',{d:'M9 22V12h6v10'}]],
    briefcase: [['rect',{x:2,y:7,width:20,height:14,rx:2}],['path',{d:'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'}]],
    users: [['path',{d:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'}],['circle',{cx:9,cy:7,r:4}],['path',{d:'M23 21v-2a4 4 0 0 0-3-3.87'}],['path',{d:'M16 3.13a4 4 0 0 1 0 7.75'}]],
    logout: [['path',{d:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'}],['path',{d:'M16 17l5-5-5-5'}],['path',{d:'M21 12H9'}]],
    calendar: [['rect',{x:3,y:4,width:18,height:18,rx:2}],['path',{d:'M16 2v4M8 2v4M3 10h18'}]],
    phone: [['path',{d:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.98.36 1.94.7 2.86a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.22-1.22a2 2 0 0 1 2.11-.45c.92.34 1.88.57 2.86.7A2 2 0 0 1 22 16.92z'}]],
    shield: [['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}]],
    send: [['path',{d:'M22 2 11 13'}],['path',{d:'M22 2l-7 20-4-9-9-4z'}]],
    edit: [['path',{d:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'}],['path',{d:'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'}]],
    x: [['path',{d:'M18 6 6 18M6 6l12 12'}]],
    more: [['circle',{cx:12,cy:12,r:1}],['circle',{cx:19,cy:12,r:1}],['circle',{cx:5,cy:12,r:1}]],
    filter: [['path',{d:'M22 3H2l8 9.46V19l4 2v-8.54z'}]],
    doc: [['path',{d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}],['path',{d:'M14 2v6h6'}],['path',{d:'M16 13H8M16 17H8M10 9H8'}]],
    message: [['path',{d:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'}]],
    handshake: [['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}]]
  };
  function Icon(props) {
    const size = props.size || 20;
    const parts = PATHS[props.name] || PATHS.file;
    return h('svg', Object.assign({ width: size, height: size, viewBox: '0 0 24 24' }, P, { style: props.style }),
      parts.map(function (pt, i) { return h(pt[0], Object.assign({ key: i }, pt[1])); }));
  }

  function Brand(props) {
    const size = props.size || 'md';
    const box = size === 'lg' ? 46 : size === 'sm' ? 26 : 34;
    const font = size === 'lg' ? 24 : size === 'sm' ? 15 : 19;
    const mark = Math.round(box * 0.5);
    const onDark = props.onDark;
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: size === 'lg' ? 13 : 9 } },
      h('span', { style: { width: box, height: box, borderRadius: Math.round(box * 0.3), background: onDark ? '#FFFFFF' : 'var(--primary-600)', color: onDark ? 'var(--primary-700)' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: onDark ? 'none' : 'var(--shadow-sm)' } },
        h(Icon, { name: 'shield', size: mark })),
      props.hideWord ? null : h('span', { style: { fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: font, letterSpacing: '-0.02em', color: onDark ? '#FFFFFF' : 'var(--text-primary)' } }, 'Amparo'));
  }

  function Label(props) {
    return h('div', { className: 'proto-label' }, props.text, props.tag && h('span', { className: 'tag' }, props.tag));
  }
  function PhoneFrame(props) {
    return h('div', { className: 'proto-item' },
      h(Label, { text: props.label, tag: props.tag || '375' }),
      h('div', { className: 'phone' }, h('div', { className: 'phone-screen' }, props.children)));
  }
  function BrowserFrame(props) {
    return h('div', { className: 'proto-item', style: { width: '100%', alignItems: 'stretch' } },
      h(Label, { text: props.label, tag: props.tag || '1280' }),
      h('div', { className: 'browser' },
        h('div', { className: 'browser-bar' },
          h('span', { className: 'browser-dot', style: { background: '#E5695B' } }),
          h('span', { className: 'browser-dot', style: { background: '#E8B84B' } }),
          h('span', { className: 'browser-dot', style: { background: '#5FBE7E' } }),
          h('span', { className: 'browser-url' }, props.url || 'app.amparo.ar')),
        h('div', { className: 'browser-screen' + (props.tall ? ' tall' : '') }, props.children)));
  }
  function Canvas(props) {
    return h('div', { className: 'proto-canvas' },
      h('div', { className: 'proto-head' },
        props.eyebrow && h('span', { className: 'proto-eyebrow' }, props.eyebrow),
        h('h1', { className: 'proto-title' }, props.title),
        props.sub && h('p', { className: 'proto-sub' }, props.sub)),
      h('div', { className: 'proto-gallery' + (props.left ? ' left' : '') }, props.children));
  }
  function mount(el) {
    ReactDOM.createRoot(document.getElementById('root')).render(el);
  }

  window.Proto = { h: h, Icon: Icon, Brand: Brand, Label: Label, PhoneFrame: PhoneFrame, BrowserFrame: BrowserFrame, Canvas: Canvas, mount: mount };
})();
