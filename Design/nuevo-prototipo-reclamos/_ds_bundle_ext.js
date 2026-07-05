/* @ds-bundle-ext: Amparo — 12 componentes adicionales del brief (Fase 0.1 / REC-53).
   RadioGroup, FileUpload, DatePicker, Modal, Drawer, Toast, EmptyState,
   Skeleton, ProgressBar, Breadcrumb, Sidebar, Header.
   Extiende window.AmparoDesignSystem_70b626 (definido por _ds_bundle.js).
   Cargá este archivo DESPUÉS de _ds_bundle.js. */

(() => {

const __ds_ns = (window.AmparoDesignSystem_70b626 = window.AmparoDesignSystem_70b626 || {});
const __ds_scope = {};
(__ds_ns.__errors = __ds_ns.__errors || []);
const { useState, useRef } = React;
const h = React.createElement;

// components/forms/Radio.jsx
try { (() => {
function RadioGroup({ label, name, options = [], value, onChange, error, hint, disabled = false, required = false, direction = 'vertical' }) {
  const [focused, setFocused] = useState(null);
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return h('div', { role: 'radiogroup', 'aria-label': label, style: { display: 'flex', flexDirection: 'column', gap: '9px', width: '100%' } },
    label && h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 600, color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '3px' } }, label, required && h('span', { style: { color: 'var(--danger-500)' } }, '*')),
    h('div', { style: { display: 'flex', flexDirection: direction === 'horizontal' ? 'row' : 'column', gap: direction === 'horizontal' ? '20px' : '10px', flexWrap: 'wrap' } },
      norm.map((opt) => {
        const checked = value === opt.value;
        const isFocused = focused === opt.value;
        const dotBorder = error ? 'var(--danger-500)' : checked ? 'var(--primary-600)' : isFocused ? 'var(--focus-ring)' : 'var(--border-strong)';
        return h('label', { key: opt.value, style: { display: 'flex', alignItems: 'flex-start', gap: '11px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 } },
          h('input', { type: 'radio', name: name, value: opt.value, checked: checked, onChange: () => onChange && onChange(opt.value), disabled: disabled, onFocus: () => setFocused(opt.value), onBlur: () => setFocused(null), style: { position: 'absolute', opacity: 0, width: 0, height: 0 } }),
          h('span', { style: { width: 20, height: 20, borderRadius: 'var(--radius-full)', border: '2px solid ' + dotBorder, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: isFocused ? 'var(--focus-ring-shadow)' : 'none', transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)', marginTop: '1px' } },
            checked && h('span', { style: { width: 10, height: 10, borderRadius: 'var(--radius-full)', background: 'var(--primary-600)' } })),
          h('span', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
            h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', color: 'var(--text-primary)', lineHeight: 1.45 } }, opt.label),
            opt.hint && h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', color: 'var(--text-tertiary)', lineHeight: 1.4 } }, opt.hint)));
      })),
    (error || hint) && h('p', { style: { margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', lineHeight: 1.45, color: error ? 'var(--danger-600)' : 'var(--text-tertiary)' } }, error || hint));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/forms/Radio.jsx', error: String((e && e.message) || e) }); }

// components/forms/FileUpload.jsx
try { (() => {
const UploadIcon = h('svg', { width: '22', height: '22', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }), h('polyline', { points: '17 8 12 3 7 8' }), h('line', { x1: '12', y1: '3', x2: '12', y2: '15' }));
const FileIcon = h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }), h('polyline', { points: '14 2 14 8 20 8' }));
function FileUpload({ label, hint, error, accept, multiple = false, files = [], onSelect, onRemove, disabled = false, required = false, helperText = 'Arrastrá los archivos acá o hacé clic para elegirlos', subText = 'PDF, JPG o PNG · hasta 10 MB' }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const borderColor = error ? 'var(--danger-500)' : drag ? 'var(--primary-500)' : 'var(--border-strong)';
  const handleFiles = (list) => { if (onSelect && list && list.length) onSelect(Array.from(list)); };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px', width: '100%' } },
    label && h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 600, color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '3px' } }, label, required && h('span', { style: { color: 'var(--danger-500)' } }, '*')),
    h('div', { onClick: () => !disabled && inputRef.current && inputRef.current.click(), onDragOver: (e) => { e.preventDefault(); if (!disabled) setDrag(true); }, onDragLeave: () => setDrag(false), onDrop: (e) => { e.preventDefault(); setDrag(false); if (!disabled) handleFiles(e.dataTransfer.files); }, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '26px 20px', textAlign: 'center', border: '1.5px dashed ' + borderColor, borderRadius: 'var(--radius-lg)', background: drag ? 'var(--primary-50)' : 'var(--bg-inset)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'border-color 0.15s var(--ease-standard), background 0.15s var(--ease-standard)' } },
      h('span', { style: { color: drag ? 'var(--primary-600)' : 'var(--text-tertiary)' } }, UploadIcon),
      h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', lineHeight: 1.5 } }, helperText),
      h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', color: 'var(--text-tertiary)' } }, subText),
      h('input', { ref: inputRef, type: 'file', accept: accept, multiple: multiple, disabled: disabled, onChange: (e) => handleFiles(e.target.files), style: { display: 'none' } })),
    files.length > 0 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' } },
      files.map((f, i) => h('div', { key: f.name + i, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' } },
        h('span', { style: { color: 'var(--primary-600)', flexShrink: 0, display: 'flex' } }, FileIcon),
        h('span', { style: { flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, f.name),
        f.size && h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 } }, f.size),
        h('button', { type: 'button', 'aria-label': 'Quitar ' + f.name, onClick: (e) => { e.stopPropagation(); onRemove && onRemove(i); }, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)', flexShrink: 0, lineHeight: 0 } },
          h('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), h('line', { x1: '6', y1: '6', x2: '18', y2: '18' })))))),
    (error || hint) && h('p', { style: { margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', lineHeight: 1.45, color: error ? 'var(--danger-600)' : 'var(--text-tertiary)' } }, error || hint));
}
Object.assign(__ds_scope, { FileUpload });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/forms/FileUpload.jsx', error: String((e && e.message) || e) }); }

// components/forms/DatePicker.jsx
try { (() => {
const CalendarIcon = h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' }), h('line', { x1: '16', y1: '2', x2: '16', y2: '6' }), h('line', { x1: '8', y1: '2', x2: '8', y2: '6' }), h('line', { x1: '3', y1: '10', x2: '21', y2: '10' }));
function DatePicker({ label, value, onChange, error, hint, disabled = false, required = false, min, max, id, size = 'md' }) {
  const [focused, setFocused] = useState(false);
  const dateId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--danger-500)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)';
  const focusShadow = focused ? (error ? 'var(--focus-ring-shadow-danger)' : 'var(--focus-ring-shadow)') : 'none';
  const height = size === 'lg' ? '52px' : '44px';
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px', width: '100%' } },
    label && h('label', { htmlFor: dateId, style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 600, color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '3px' } }, label, required && h('span', { style: { color: 'var(--danger-500)' } }, '*')),
    h('div', { style: { position: 'relative', width: '100%' } },
      h('input', { id: dateId, type: 'date', value: value, onChange: onChange, disabled: disabled, required: required, min: min, max: max, onFocus: () => setFocused(true), onBlur: () => setFocused(false), style: { width: '100%', height: height, padding: '0 42px 0 14px', border: '1.5px solid ' + borderColor, borderRadius: 'var(--radius-md)', background: disabled ? 'var(--neutral-100)' : 'var(--bg-inset)', boxShadow: focusShadow, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', color: value ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none', transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)' } }),
      h('span', { style: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none', display: 'flex' } }, CalendarIcon)),
    (error || hint) && h('p', { style: { margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', lineHeight: 1.45, color: error ? 'var(--danger-600)' : 'var(--text-tertiary)' } }, error || hint));
}
Object.assign(__ds_scope, { DatePicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/forms/DatePicker.jsx', error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
const SIZES = { sm: 400, md: 520, lg: 680 };
function Modal({ open = true, onClose, title, children, footer, size = 'md', closeOnBackdrop = true, inline = false }) {
  if (!open) return null;
  const position = inline ? 'absolute' : 'fixed';
  return h('div', { onClick: closeOnBackdrop ? onClose : undefined, style: { position: position, inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', background: 'rgba(33,29,24,0.48)', animation: 'amparo-fade-in var(--dur-base) var(--ease-standard)' } },
    h('div', { role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation(), style: { width: '100%', maxWidth: SIZES[size] || SIZES.md, maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', animation: 'amparo-scale-in var(--dur-base) var(--ease-out)' } },
      (title || onClose) && h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--divider)' } },
        h('h3', { style: { margin: 0, flex: 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-h3-size)', fontWeight: 'var(--text-h3-weight)', letterSpacing: 'var(--text-h3-ls)', color: 'var(--text-primary)', lineHeight: 'var(--text-h3-lh)' } }, title),
        onClose && h('button', { type: 'button', 'aria-label': 'Cerrar', onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, margin: '-2px -4px 0 0', color: 'var(--text-tertiary)', lineHeight: 0, flexShrink: 0 } },
          h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), h('line', { x1: '6', y1: '6', x2: '18', y2: '18' })))),
      h('div', { style: { padding: 'var(--space-6)', overflowY: 'auto', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', lineHeight: 'var(--text-body-lh)', color: 'var(--text-secondary)' } }, children),
      footer && h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--divider)', background: 'var(--bg-subtle)' } }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/feedback/Modal.jsx', error: String((e && e.message) || e) }); }

// components/feedback/Drawer.jsx
try { (() => {
function Drawer({ open = true, onClose, title, children, footer, width = 480, side = 'right', closeOnBackdrop = true, inline = false }) {
  if (!open) return null;
  const position = inline ? 'absolute' : 'fixed';
  const isRight = side === 'right';
  return h('div', { onClick: closeOnBackdrop ? onClose : undefined, style: { position: position, inset: 0, zIndex: 50, display: 'flex', justifyContent: isRight ? 'flex-end' : 'flex-start', background: 'rgba(33,29,24,0.48)', animation: 'amparo-fade-in var(--dur-base) var(--ease-standard)' } },
    h('div', { role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation(), style: { width: '100%', maxWidth: width, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-xl)', animation: (isRight ? 'amparo-slide-in-right' : 'amparo-slide-in-left') + ' var(--dur-slow) var(--ease-out)' } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--divider)', flexShrink: 0 } },
        h('h3', { style: { margin: 0, flex: 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-h3-size)', fontWeight: 'var(--text-h3-weight)', letterSpacing: 'var(--text-h3-ls)', color: 'var(--text-primary)', lineHeight: 'var(--text-h3-lh)' } }, title),
        onClose && h('button', { type: 'button', 'aria-label': 'Cerrar', onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, margin: '-2px -4px 0 0', color: 'var(--text-tertiary)', lineHeight: 0, flexShrink: 0 } },
          h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), h('line', { x1: '6', y1: '6', x2: '18', y2: '18' })))),
      h('div', { style: { flex: 1, padding: 'var(--space-6)', overflowY: 'auto', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', lineHeight: 'var(--text-body-lh)', color: 'var(--text-secondary)' } }, children),
      footer && h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--divider)', background: 'var(--bg-subtle)', flexShrink: 0 } }, footer)));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/feedback/Drawer.jsx', error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONE = { info: { icon: 'var(--primary-600)', ring: 'var(--primary-100)' }, success: { icon: 'var(--success-600)', ring: 'var(--success-100)' }, warning: { icon: 'var(--warning-600)', ring: 'var(--warning-100)' }, error: { icon: 'var(--danger-600)', ring: 'var(--danger-100)' } };
const ICONS = {
  info: h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('circle', { cx: '12', cy: '12', r: '10' }), h('line', { x1: '12', y1: '8', x2: '12', y2: '12' }), h('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' })),
  success: h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }), h('polyline', { points: '22 4 12 14.01 9 11.01' })),
  warning: h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }), h('line', { x1: '12', y1: '9', x2: '12', y2: '13' }), h('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' })),
  error: h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('circle', { cx: '12', cy: '12', r: '10' }), h('line', { x1: '15', y1: '9', x2: '9', y2: '15' }), h('line', { x1: '9', y1: '9', x2: '15', y2: '15' })),
};
function Toast({ variant = 'info', title, children, onClose }) {
  const t = TONE[variant] || TONE.info;
  return h('div', { role: 'status', style: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', width: '100%', maxWidth: 400, padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', animation: 'amparo-slide-in-right var(--dur-base) var(--ease-out)' } },
    h('span', { style: { width: 28, height: 28, borderRadius: 'var(--radius-full)', background: t.ring, color: t.icon, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, ICONS[variant]),
    h('div', { style: { flex: 1, minWidth: 0, paddingTop: '3px' } },
      title && h('p', { style: { margin: '0 0 1px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 } }, title),
      children && h('div', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', lineHeight: 1.45 } }, children)),
    onClose && h('button', { type: 'button', 'aria-label': 'Cerrar', onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)', flexShrink: 0, lineHeight: 0 } },
      h('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), h('line', { x1: '6', y1: '6', x2: '18', y2: '18' }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/feedback/Toast.jsx', error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
const DefaultIcon = h('svg', { width: '26', height: '26', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }), h('polyline', { points: '14 2 14 8 20 8' }));
function EmptyState({ icon, title, description, action, compact = false }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--space-3)', padding: compact ? 'var(--space-6)' : 'var(--space-10) var(--space-6)' } },
    h('span', { style: { width: compact ? 44 : 56, height: compact ? 44 : 56, borderRadius: 'var(--radius-full)', background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' } }, icon || DefaultIcon),
    title && h('p', { style: { margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-h4-size)', fontWeight: 'var(--text-h4-weight)', color: 'var(--text-primary)', lineHeight: 'var(--text-h4-lh)' } }, title),
    description && h('p', { style: { margin: 0, maxWidth: 380, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', lineHeight: 1.55 } }, description),
    action && h('div', { style: { marginTop: 'var(--space-2)' } }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/feedback/EmptyState.jsx', error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function Skeleton({ variant = 'block', width, height, lines = 3, radius }) {
  const base = { background: 'linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 37%, var(--neutral-100) 63%)', backgroundSize: '400% 100%', animation: 'amparo-shimmer 1.4s ease-in-out infinite' };
  if (variant === 'text') {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px', width: width || '100%' } },
      Array.from({ length: lines }).map((_, i) => h('div', { key: i, style: Object.assign({}, base, { height: height || 12, borderRadius: 'var(--radius-sm)', width: i === lines - 1 ? '65%' : '100%' }) })));
  }
  if (variant === 'circle') {
    const d = width || height || 44;
    return h('div', { style: Object.assign({}, base, { width: d, height: d, borderRadius: 'var(--radius-full)', flexShrink: 0 }) });
  }
  return h('div', { style: Object.assign({}, base, { width: width || '100%', height: height || 80, borderRadius: radius || 'var(--radius-md)' }) });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/feedback/Skeleton.jsx', error: String((e && e.message) || e) }); }

// components/navigation/ProgressBar.jsx
try { (() => {
function ProgressBar({ value = null, max = 100, label, showValue = false, size = 'md' }) {
  const height = size === 'sm' ? 6 : 10;
  const indeterminate = value === null || value === undefined;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' } },
    (label || showValue) && h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' } },
      label && h('span', { style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 500, color: 'var(--text-secondary)' } }, label),
      showValue && !indeterminate && h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-tertiary)' } }, Math.round(pct) + '%')),
    h('div', { style: { width: '100%', height: height, background: 'var(--neutral-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' } },
      h('div', { style: { height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--primary-600)', width: indeterminate ? '40%' : pct + '%', animation: indeterminate ? 'amparo-progress 1.3s var(--ease-standard) infinite' : 'none', transition: indeterminate ? 'none' : 'width var(--dur-slow) var(--ease-standard)' } })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/navigation/ProgressBar.jsx', error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
const Chevron = h('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('polyline', { points: '9 18 15 12 9 6' }));
function Breadcrumb({ items = [] }) {
  return h('nav', { 'aria-label': 'Ruta', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' } },
    items.map((item, i) => {
      const isLast = i === items.length - 1;
      return h(React.Fragment, { key: i },
        isLast
          ? h('span', { 'aria-current': 'page', style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 600, color: 'var(--text-primary)' } }, item.label)
          : h('a', { href: item.href || '#', onClick: item.onClick, style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm-size)', fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none', cursor: 'pointer' } }, item.label),
        !isLast && h('span', { style: { color: 'var(--text-tertiary)', display: 'flex' } }, Chevron));
    }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/navigation/Breadcrumb.jsx', error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
function Sidebar({ brand = 'Amparo', items = [], activeId, onNavigate, footer, width = 240 }) {
  return h('aside', { style: { width: width, minHeight: '100%', flexShrink: 0, background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', height: 60, padding: '0 var(--space-5)', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0 } },
      h('span', { style: { width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--primary-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 } }, 'A'),
      h('span', { style: { fontSize: 16, fontWeight: 700, color: 'var(--sidebar-text-strong)', letterSpacing: '-0.01em' } }, brand)),
    h('nav', { style: { flex: 1, padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' } },
      items.map((item) => {
        const active = item.id === activeId;
        return h('button', { key: item.id, type: 'button', onClick: () => onNavigate && onNavigate(item.id), style: { display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--radius-md)', background: active ? 'var(--sidebar-active-bg)' : 'transparent', color: active ? 'var(--sidebar-active)' : 'var(--sidebar-text)', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: active ? 600 : 500, transition: 'background 0.15s var(--ease-standard), color 0.15s var(--ease-standard)' } },
          item.icon && h('span', { style: { display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.85 } }, item.icon),
          h('span', { style: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, item.label),
          item.count !== undefined && h('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 'var(--radius-full)', background: active ? 'var(--primary-500)' : 'rgba(255,255,255,0.12)', color: active ? '#fff' : 'var(--sidebar-text-strong)', fontSize: 11, fontWeight: 700 } }, item.count));
      })),
    footer && h('div', { style: { padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--sidebar-border)', flexShrink: 0 } }, footer));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/navigation/Sidebar.jsx', error: String((e && e.message) || e) }); }

// components/navigation/Header.jsx
try { (() => {
const BackIcon = h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, h('line', { x1: '19', y1: '12', x2: '5', y2: '12' }), h('polyline', { points: '12 19 5 12 12 5' }));
function Header({ title, subtitle, onBack, right, align = 'left' }) {
  return h('header', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: 56, padding: '0 var(--space-4)', width: '100%', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-sans)' } },
    onBack && h('button', { type: 'button', 'aria-label': 'Volver', onClick: onBack, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, margin: '0 -4px', color: 'var(--text-secondary)', lineHeight: 0, flexShrink: 0 } }, BackIcon),
    h('div', { style: { flex: 1, minWidth: 0, textAlign: align, display: 'flex', flexDirection: 'column', gap: '1px' } },
      h('span', { style: { fontSize: 'var(--text-h4-size)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, title),
      subtitle && h('span', { style: { fontSize: 'var(--text-caption-size)', color: 'var(--text-tertiary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, subtitle)),
    right ? h('div', { style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, right) : ((onBack && align === 'center') ? h('span', { style: { width: 20, flexShrink: 0 } }) : null));
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: 'components/navigation/Header.jsx', error: String((e && e.message) || e) }); }

__ds_ns.RadioGroup = __ds_scope.RadioGroup;
__ds_ns.FileUpload = __ds_scope.FileUpload;
__ds_ns.DatePicker = __ds_scope.DatePicker;
__ds_ns.Modal = __ds_scope.Modal;
__ds_ns.Drawer = __ds_scope.Drawer;
__ds_ns.Toast = __ds_scope.Toast;
__ds_ns.EmptyState = __ds_scope.EmptyState;
__ds_ns.Skeleton = __ds_scope.Skeleton;
__ds_ns.ProgressBar = __ds_scope.ProgressBar;
__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;
__ds_ns.Sidebar = __ds_scope.Sidebar;
__ds_ns.Header = __ds_scope.Header;

})();
