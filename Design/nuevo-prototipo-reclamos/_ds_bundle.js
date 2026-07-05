/* @ds-bundle: {"format":4,"namespace":"AmparoDesignSystem_70b626","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Drawer","sourcePath":"components/feedback/Drawer.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"DatePicker","sourcePath":"components/forms/DatePicker.jsx"},{"name":"FileUpload","sourcePath":"components/forms/FileUpload.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"Header","sourcePath":"components/navigation/Header.jsx"},{"name":"ProgressBar","sourcePath":"components/navigation/ProgressBar.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Stepper","sourcePath":"components/navigation/Stepper.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"d0a65b5e938d","components/core/Button.jsx":"a681fcf86780","components/core/Card.jsx":"a1a058494036","components/core/Input.jsx":"51744d78237a","components/feedback/Alert.jsx":"dd650870a47c","components/feedback/Drawer.jsx":"f2d16e713dad","components/feedback/EmptyState.jsx":"13d8f3c22270","components/feedback/Modal.jsx":"1a9f53cba4b9","components/feedback/Skeleton.jsx":"b0c1cb3e4848","components/feedback/Toast.jsx":"8798a330fa62","components/forms/Checkbox.jsx":"a2f1394afb55","components/forms/DatePicker.jsx":"6f32efebcba4","components/forms/FileUpload.jsx":"5aadd63683a0","components/forms/Radio.jsx":"78d2f9a43623","components/forms/Select.jsx":"2614a4fe83d3","components/forms/Textarea.jsx":"e98a485d8a7c","components/navigation/Breadcrumb.jsx":"71f40d7e4a33","components/navigation/Header.jsx":"9456ec1f5a72","components/navigation/ProgressBar.jsx":"844278069ded","components/navigation/Sidebar.jsx":"e1b41c979d68","components/navigation/Stepper.jsx":"bfdbb44a07b9","components/navigation/Tabs.jsx":"2ced6c9cf98b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AmparoDesignSystem_70b626 = window.AmparoDesignSystem_70b626 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const STYLES = {
  /* Etapas del caso (pipeline) */
  nuevo: {
    background: 'var(--badge-nuevo-bg)',
    color: 'var(--badge-nuevo-text)',
    border: '1px solid var(--badge-nuevo-border)'
  },
  'expediente-armado': {
    background: 'var(--badge-armado-bg)',
    color: 'var(--badge-armado-text)',
    border: '1px solid var(--badge-armado-border)'
  },
  'expediente-completo': {
    background: 'var(--badge-completo-bg)',
    color: 'var(--badge-completo-text)',
    border: '1px solid var(--badge-completo-border)'
  },
  presentado: {
    background: 'var(--badge-presentado-bg)',
    color: 'var(--badge-presentado-text)',
    border: '1px solid var(--badge-presentado-border)'
  },
  negociacion: {
    background: 'var(--badge-negociacion-bg)',
    color: 'var(--badge-negociacion-text)',
    border: '1px solid var(--badge-negociacion-border)'
  },
  resuelto: {
    background: 'var(--badge-resuelto-bg)',
    color: 'var(--badge-resuelto-text)',
    border: '1px solid var(--badge-resuelto-border)'
  },
  /* Resultado de cierre */
  rechazado: {
    background: 'var(--badge-rechazado-bg)',
    color: 'var(--badge-rechazado-text)',
    border: '1px solid var(--badge-rechazado-border)'
  },
  apelacion: {
    background: 'var(--badge-apelacion-bg)',
    color: 'var(--badge-apelacion-text)',
    border: '1px solid var(--badge-apelacion-border)'
  },
  /* Prioridad */
  alta: {
    background: 'var(--badge-alta-bg)',
    color: 'var(--badge-alta-text)',
    border: 'none'
  },
  media: {
    background: 'var(--badge-media-bg)',
    color: 'var(--badge-media-text)',
    border: 'none'
  },
  baja: {
    background: 'var(--badge-baja-bg)',
    color: 'var(--badge-baja-text)',
    border: 'none'
  },
  /* Estado de pedido de documentación */
  pendiente: {
    background: 'var(--badge-pendiente-bg)',
    color: 'var(--badge-pendiente-text)',
    border: 'none'
  },
  respondido: {
    background: 'var(--badge-respondido-bg)',
    color: 'var(--badge-respondido-text)',
    border: 'none'
  },
  /* Vencimiento */
  'venc-proximo': {
    background: 'var(--alert-venc-proximo-bg)',
    color: 'var(--alert-venc-proximo-text)',
    border: '1px solid var(--alert-venc-proximo-border)'
  },
  'venc-vencido': {
    background: 'var(--alert-venc-vencido-bg)',
    color: 'var(--alert-venc-vencido-text)',
    border: '1px solid var(--alert-venc-vencido-border)'
  }
};
const DEFAULT_LABELS = {
  nuevo: 'NUEVO',
  'expediente-armado': 'EXPEDIENTE EN ARMADO',
  'expediente-completo': 'EXPEDIENTE COMPLETO',
  presentado: 'PRESENTADO',
  negociacion: 'EN NEGOCIACIÓN',
  resuelto: 'RESUELTO',
  rechazado: 'RECHAZADO',
  apelacion: 'EN APELACIÓN',
  alta: 'ALTA',
  media: 'MEDIA',
  baja: 'BAJA',
  pendiente: 'PENDIENTE',
  respondido: 'RESPONDIDO',
  'venc-proximo': 'PRÓXIMO A VENCER',
  'venc-vencido': 'VENCIDO'
};
function Badge({
  variant = 'nuevo',
  children,
  dot = false
}) {
  const vs = STYLES[variant] || STYLES.nuevo;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 9px',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-label-size)',
      fontWeight: 700,
      letterSpacing: 'var(--text-label-ls)',
      textTransform: 'uppercase',
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...vs
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
      flexShrink: 0,
      opacity: 0.85
    }
  }), children ?? DEFAULT_LABELS[variant]);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const SIZES = {
  sm: {
    padding: '0 14px',
    fontSize: '13px',
    height: '34px',
    gap: '6px'
  },
  md: {
    padding: '0 18px',
    fontSize: '15px',
    height: '42px',
    gap: '8px'
  },
  lg: {
    padding: '0 26px',
    fontSize: '16px',
    height: '52px',
    gap: '9px'
  }
};
const VARIANT_BASE = (hovered, active) => ({
  primary: {
    background: active ? 'var(--primary-700)' : hovered ? 'var(--primary-600)' : 'var(--primary-600)',
    color: '#FFFFFF',
    border: '1.5px solid transparent',
    boxShadow: hovered && !active ? 'var(--shadow-sm)' : 'none'
  },
  secondary: {
    background: hovered ? 'var(--neutral-100)' : 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: `1.5px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
    boxShadow: 'none'
  },
  ghost: {
    background: hovered ? 'var(--neutral-100)' : 'transparent',
    color: 'var(--text-secondary)',
    border: '1.5px solid transparent',
    boxShadow: 'none'
  },
  danger: {
    background: active ? 'var(--danger-700)' : hovered ? 'var(--danger-600)' : 'var(--danger-600)',
    color: '#FFFFFF',
    border: '1.5px solid transparent',
    boxShadow: 'none'
  }
});
function Button({
  variant = 'primary',
  size = 'md',
  rounded = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  iconLeft,
  iconRight,
  children,
  onClick,
  type = 'button',
  ...props
}) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const sz = SIZES[size] || SIZES.md;
  const vr = VARIANT_BASE(hovered, active)[variant] || VARIANT_BASE(false, false).primary;
  const radius = rounded === 'pill' ? 'var(--radius-full)' : 'var(--radius-md)';
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled || loading,
    onClick: onClick,
    onMouseEnter: () => !disabled && setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setActive(false);
    },
    onMouseDown: () => !disabled && setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: sz.gap,
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: sz.fontSize,
      lineHeight: 1,
      height: sz.height,
      padding: sz.padding,
      borderRadius: radius,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: 'background 0.15s var(--ease-standard), border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)',
      transform: active && !disabled ? 'translateY(0.5px)' : 'translateY(0)',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      width: fullWidth ? '100%' : undefined,
      opacity: disabled ? 0.45 : 1,
      outline: 'none',
      ...vr
    }
  }, props), loading && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 15,
      height: 15,
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.6s linear infinite'
    }
  }), !loading && iconLeft, /*#__PURE__*/React.createElement("span", null, children), !loading && iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const PADDING_MAP = {
  none: '0',
  sm: 'var(--space-4)',
  md: 'var(--card-pad-dense)',
  /* 20 — agente */
  lg: 'var(--card-pad-comfy)' /* 28 — damnificado */
};
const SHADOW_MAP = {
  none: 'none',
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  lift: 'var(--shadow-lift)'
};
const RADIUS_MAP = {
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)'
};
function Card({
  children,
  padding = 'md',
  shadow = 'sm',
  border = true,
  radius = 'lg',
  clickable = false,
  onClick,
  header,
  footer,
  style: externalStyle,
  ...props
}) {
  const [hovered, setHovered] = useState(false);
  const pad = PADDING_MAP[padding] || PADDING_MAP.md;
  const currentShadow = clickable && hovered ? 'var(--shadow-md)' : SHADOW_MAP[shadow] || 'var(--shadow-sm)';
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: clickable ? onClick : undefined,
    onMouseEnter: clickable ? () => setHovered(true) : undefined,
    onMouseLeave: clickable ? () => setHovered(false) : undefined,
    style: {
      background: 'var(--bg-surface)',
      border: border ? '1px solid var(--border)' : 'none',
      borderRadius: RADIUS_MAP[radius] || 'var(--radius-lg)',
      boxShadow: currentShadow,
      cursor: clickable ? 'pointer' : 'default',
      transition: 'box-shadow 0.18s var(--ease-standard), transform 0.18s var(--ease-standard), border-color 0.18s var(--ease-standard)',
      transform: clickable && hovered ? 'translateY(-2px)' : 'translateY(0)',
      borderColor: clickable && hovered ? 'var(--border-strong)' : 'var(--border)',
      overflow: 'hidden',
      ...externalStyle
    }
  }, props), header && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: `var(--space-4) ${pad}`,
      borderBottom: '1px solid var(--divider)',
      fontFamily: 'var(--font-sans)'
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: `var(--space-4) ${pad}`,
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-subtle)',
      fontFamily: 'var(--font-sans)'
    }
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
function Input({
  label,
  placeholder = '',
  value,
  defaultValue,
  onChange,
  type = 'text',
  error,
  hint,
  disabled = false,
  required = false,
  prefix,
  suffix,
  id,
  mono = false,
  size = 'md',
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--danger-500)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)';
  const focusShadow = focused ? error ? 'var(--focus-ring-shadow-danger)' : 'var(--focus-ring-shadow)' : 'none';
  const height = size === 'lg' ? '52px' : '44px';
  const fontSize = size === 'lg' ? 'var(--text-body-lg-size)' : 'var(--text-body-size)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--neutral-100)' : 'var(--bg-inset)',
      boxShadow: focusShadow,
      transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)',
      overflow: 'hidden'
    }
  }, prefix && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px',
      color: 'var(--text-tertiary)',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      borderRight: '1px solid var(--border)',
      background: 'var(--neutral-100)',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    disabled: disabled,
    required: required,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: mono ? '13px' : fontSize,
      color: 'var(--text-primary)',
      padding: '0 14px',
      height,
      cursor: disabled ? 'not-allowed' : 'text',
      minWidth: 0
    }
  }, props)), suffix && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px',
      color: 'var(--text-tertiary)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      borderLeft: '1px solid var(--border)',
      background: 'var(--neutral-100)',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }
  }, suffix)), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
const ALERT_STYLES = {
  info: {
    bg: 'var(--primary-50)',
    border: 'var(--primary-200)',
    iconColor: 'var(--primary-600)',
    titleColor: 'var(--primary-700)',
    textColor: 'var(--primary-700)'
  },
  success: {
    bg: 'var(--success-50)',
    border: 'var(--success-200)',
    iconColor: 'var(--success-600)',
    titleColor: 'var(--success-700)',
    textColor: 'var(--success-700)'
  },
  warning: {
    bg: 'var(--warning-50)',
    border: 'var(--warning-200)',
    iconColor: 'var(--warning-600)',
    titleColor: 'var(--warning-700)',
    textColor: 'var(--warning-700)'
  },
  error: {
    bg: 'var(--danger-50)',
    border: 'var(--danger-200)',
    iconColor: 'var(--danger-600)',
    titleColor: 'var(--danger-700)',
    textColor: 'var(--danger-700)'
  }
};
const ICONS = {
  info: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "8",
    x2: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "16",
    x2: "12.01",
    y2: "16"
  })),
  success: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 11.08V12a10 10 0 1 1-5.93-9.14"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "22 4 12 14.01 9 11.01"
  })),
  warning: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "9",
    x2: "12",
    y2: "13"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "17",
    x2: "12.01",
    y2: "17"
  })),
  error: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "15",
    y1: "9",
    x2: "9",
    y2: "15"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "9",
    y1: "9",
    x2: "15",
    y2: "15"
  }))
};
function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss
}) {
  const s = ALERT_STYLES[variant] || ALERT_STYLES.info;
  return /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${s.border}`,
      background: s.bg
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: s.iconColor,
      flexShrink: 0,
      marginTop: '1px'
    }
  }, ICONS[variant]), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 2px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: s.titleColor,
      lineHeight: 1.4
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      color: s.textColor,
      lineHeight: 1.5,
      opacity: 0.92
    }
  }, children)), dismissible && /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Cerrar",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '2px',
      color: s.iconColor,
      flexShrink: 0,
      opacity: 0.7,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  }))));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Drawer.jsx
try { (() => {
/* Panel lateral (drawer). Por defecto 480px desde la derecha. Para
   detalle contextual del agente sin perder la lista de fondo. */
function Drawer({
  open = true,
  onClose,
  title,
  children,
  footer,
  width = 480,
  side = 'right',
  closeOnBackdrop = true,
  inline = false
}) {
  if (!open) return null;
  const position = inline ? 'absolute' : 'fixed';
  const isRight = side === 'right';
  return /*#__PURE__*/React.createElement("div", {
    onClick: closeOnBackdrop ? onClose : undefined,
    style: {
      position,
      inset: 0,
      zIndex: 50,
      display: 'flex',
      justifyContent: isRight ? 'flex-end' : 'flex-start',
      background: 'rgba(33,29,24,0.48)',
      animation: 'amparo-fade-in var(--dur-base) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: width,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-surface)',
      boxShadow: 'var(--shadow-xl)',
      animation: `${isRight ? 'amparo-slide-in-right' : 'amparo-slide-in-left'} var(--dur-slow) var(--ease-out)`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-4)',
      padding: 'var(--space-5) var(--space-6)',
      borderBottom: '1px solid var(--divider)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      flex: 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 'var(--text-h3-weight)',
      letterSpacing: 'var(--text-h3-ls)',
      color: 'var(--text-primary)',
      lineHeight: 'var(--text-h3-lh)'
    }
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Cerrar",
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      margin: '-2px -4px 0 0',
      color: 'var(--text-tertiary)',
      lineHeight: 0,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 'var(--space-6)',
      overflowY: 'auto',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 'var(--text-body-lh)',
      color: 'var(--text-secondary)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-6)',
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-subtle)',
      flexShrink: 0
    }
  }, footer)));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Drawer.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
const DefaultIcon = /*#__PURE__*/React.createElement("svg", {
  width: "26",
  height: "26",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.6",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "14 2 14 8 20 8"
}));

/* Estado vacío: sin resultados, lista sin items, primera vez. */
function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 'var(--space-3)',
      padding: compact ? 'var(--space-6)' : 'var(--space-10) var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: compact ? 44 : 56,
      height: compact ? 44 : 56,
      borderRadius: 'var(--radius-full)',
      background: 'var(--bg-subtle)',
      color: 'var(--text-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '2px'
    }
  }, icon || DefaultIcon), title && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h4-size)',
      fontWeight: 'var(--text-h4-weight)',
      color: 'var(--text-primary)',
      lineHeight: 'var(--text-h4-lh)'
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 380,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      color: 'var(--text-secondary)',
      lineHeight: 1.55
    }
  }, description), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-2)'
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
/* Modal base: overlay + card centrada. `inline` la ancla al contenedor
   (para previews/embebido); por defecto cubre el viewport (fixed). */
const SIZES = {
  sm: 400,
  md: 520,
  lg: 680
};
function Modal({
  open = true,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  inline = false
}) {
  if (!open) return null;
  const position = inline ? 'absolute' : 'fixed';
  return /*#__PURE__*/React.createElement("div", {
    onClick: closeOnBackdrop ? onClose : undefined,
    style: {
      position,
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)',
      background: 'rgba(33,29,24,0.48)',
      animation: 'amparo-fade-in var(--dur-base) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: SIZES[size] || SIZES.md,
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-xl)',
      overflow: 'hidden',
      animation: 'amparo-scale-in var(--dur-base) var(--ease-out)'
    }
  }, (title || onClose) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-4)',
      padding: 'var(--space-5) var(--space-6)',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      flex: 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 'var(--text-h3-weight)',
      letterSpacing: 'var(--text-h3-ls)',
      color: 'var(--text-primary)',
      lineHeight: 'var(--text-h3-lh)'
    }
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Cerrar",
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      margin: '-2px -4px 0 0',
      color: 'var(--text-tertiary)',
      lineHeight: 0,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-6)',
      overflowY: 'auto',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 'var(--text-body-lh)',
      color: 'var(--text-secondary)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-6)',
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-subtle)'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
/* Placeholder de carga con shimmer cálido. `variant` text|block|circle. */
function Skeleton({
  variant = 'block',
  width,
  height,
  lines = 3,
  radius
}) {
  const base = {
    background: 'linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 37%, var(--neutral-100) 63%)',
    backgroundSize: '400% 100%',
    animation: 'amparo-shimmer 1.4s ease-in-out infinite'
  };
  if (variant === 'text') {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        width: width || '100%'
      }
    }, Array.from({
      length: lines
    }).map((_, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        ...base,
        height: height || 12,
        borderRadius: 'var(--radius-sm)',
        width: i === lines - 1 ? '65%' : '100%'
      }
    })));
  }
  if (variant === 'circle') {
    const d = width || height || 44;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...base,
        width: d,
        height: d,
        borderRadius: 'var(--radius-full)',
        flexShrink: 0
      }
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...base,
      width: width || '100%',
      height: height || 80,
      borderRadius: radius || 'var(--radius-md)'
    }
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONE = {
  info: {
    icon: 'var(--primary-600)',
    ring: 'var(--primary-100)'
  },
  success: {
    icon: 'var(--success-600)',
    ring: 'var(--success-100)'
  },
  warning: {
    icon: 'var(--warning-600)',
    ring: 'var(--warning-100)'
  },
  error: {
    icon: 'var(--danger-600)',
    ring: 'var(--danger-100)'
  }
};
const ICONS = {
  info: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "8",
    x2: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "16",
    x2: "12.01",
    y2: "16"
  })),
  success: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 11.08V12a10 10 0 1 1-5.93-9.14"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "22 4 12 14.01 9 11.01"
  })),
  warning: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "9",
    x2: "12",
    y2: "13"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "17",
    x2: "12.01",
    y2: "17"
  })),
  error: /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "15",
    y1: "9",
    x2: "9",
    y2: "15"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "9",
    y1: "9",
    x2: "15",
    y2: "15"
  }))
};

/* Notificación breve y no bloqueante. Presentacional: la app maneja
   el stack, el timing y el auto-dismiss. */
function Toast({
  variant = 'info',
  title,
  children,
  onClose
}) {
  const t = TONE[variant] || TONE.info;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3)',
      width: '100%',
      maxWidth: 400,
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      animation: 'amparo-slide-in-right var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 'var(--radius-full)',
      background: t.ring,
      color: t.icon,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, ICONS[variant]), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      paddingTop: '3px'
    }
  }, title && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 1px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      lineHeight: 1.4
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      color: 'var(--text-secondary)',
      lineHeight: 1.45
    }
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Cerrar",
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 2,
      color: 'var(--text-tertiary)',
      flexShrink: 0,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const {
  useState
} = React;
function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  error,
  hint,
  indeterminate = false,
  id
}) {
  const [focused, setFocused] = useState(false);
  const checkId = id || (label ? `chk-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const on = checked || indeterminate;
  const boxStyle = {
    width: 20,
    height: 20,
    borderRadius: 'var(--radius-sm)',
    border: `2px solid ${error ? 'var(--danger-500)' : on ? 'var(--primary-600)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)'}`,
    background: on ? 'var(--primary-600)' : 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.15s var(--ease-standard), border-color 0.15s var(--ease-standard)',
    boxShadow: focused ? 'var(--focus-ring-shadow)' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '11px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: checkId,
    checked: checked,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    },
    ref: el => {
      if (el) el.indeterminate = indeterminate;
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: boxStyle
  }, indeterminate && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "2",
    viewBox: "0 0 10 2",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "10",
    height: "2",
    rx: "1",
    fill: "white"
  })), checked && !indeterminate && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "10",
    viewBox: "0 0 11 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4.5L4 7.5L10 1",
    stroke: "white",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)',
      lineHeight: 1.5,
      paddingTop: '1px'
    }
  }, label)), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 0 31px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/DatePicker.jsx
try { (() => {
const {
  useState
} = React;
const CalendarIcon = /*#__PURE__*/React.createElement("svg", {
  width: "18",
  height: "18",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "4",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("line", {
  x1: "16",
  y1: "2",
  x2: "16",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "8",
  y1: "2",
  x2: "8",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "3",
  y1: "10",
  x2: "21",
  y2: "10"
}));

/* Selección de fecha. Envuelve <input type="date"> nativo (accesible,
   con teclado y calendario del SO) con el estilo Amparo. La app
   guarda/valida en formato ISO; se muestra como DD/MM/AAAA. */
function DatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  min,
  max,
  id,
  size = 'md'
}) {
  const [focused, setFocused] = useState(false);
  const dateId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--danger-500)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)';
  const focusShadow = focused ? error ? 'var(--focus-ring-shadow-danger)' : 'var(--focus-ring-shadow)' : 'none';
  const height = size === 'lg' ? '52px' : '44px';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: dateId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("input", {
    id: dateId,
    type: "date",
    value: value,
    onChange: onChange,
    disabled: disabled,
    required: required,
    min: min,
    max: max,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: '100%',
      height,
      padding: '0 42px 0 14px',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--neutral-100)' : 'var(--bg-inset)',
      boxShadow: focusShadow,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      outline: 'none',
      transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 13,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-tertiary)',
      pointerEvents: 'none',
      display: 'flex'
    }
  }, CalendarIcon)), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { DatePicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/DatePicker.jsx", error: String((e && e.message) || e) }); }

// components/forms/FileUpload.jsx
try { (() => {
const {
  useRef,
  useState
} = React;
const UploadIcon = /*#__PURE__*/React.createElement("svg", {
  width: "22",
  height: "22",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "17 8 12 3 7 8"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "3",
  x2: "12",
  y2: "15"
}));
const FileIcon = /*#__PURE__*/React.createElement("svg", {
  width: "18",
  height: "18",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "14 2 14 8 20 8"
}));

/* Zona de carga de documentos y evidencias. Presentacional:
   el manejo real de archivos lo hace la app vía onSelect. */
function FileUpload({
  label,
  hint,
  error,
  accept,
  multiple = false,
  files = [],
  onSelect,
  onRemove,
  disabled = false,
  required = false,
  helperText = 'Arrastrá los archivos acá o hacé clic para elegirlos',
  subText = 'PDF, JPG o PNG · hasta 10 MB'
}) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const borderColor = error ? 'var(--danger-500)' : drag ? 'var(--primary-500)' : 'var(--border-strong)';
  const handleFiles = list => {
    if (onSelect && list && list.length) onSelect(Array.from(list));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    onClick: () => !disabled && inputRef.current && inputRef.current.click(),
    onDragOver: e => {
      e.preventDefault();
      if (!disabled) setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: e => {
      e.preventDefault();
      setDrag(false);
      if (!disabled) handleFiles(e.dataTransfer.files);
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '26px 20px',
      textAlign: 'center',
      border: `1.5px dashed ${borderColor}`,
      borderRadius: 'var(--radius-lg)',
      background: drag ? 'var(--primary-50)' : 'var(--bg-inset)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      transition: 'border-color 0.15s var(--ease-standard), background 0.15s var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: drag ? 'var(--primary-600)' : 'var(--text-tertiary)'
    }
  }, UploadIcon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      color: 'var(--text-secondary)',
      lineHeight: 1.5
    }
  }, helperText), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      color: 'var(--text-tertiary)'
    }
  }, subText), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "file",
    accept: accept,
    multiple: multiple,
    disabled: disabled,
    onChange: e => handleFiles(e.target.files),
    style: {
      display: 'none'
    }
  })), files.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginTop: '2px'
    }
  }, files.map((f, i) => /*#__PURE__*/React.createElement("div", {
    key: f.name + i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-surface)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary-600)',
      flexShrink: 0,
      display: 'flex'
    }
  }, FileIcon), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, f.name), f.size && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-tertiary)',
      flexShrink: 0
    }
  }, f.size), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": `Quitar ${f.name}`,
    onClick: e => {
      e.stopPropagation();
      onRemove && onRemove(i);
    },
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 2,
      color: 'var(--text-tertiary)',
      flexShrink: 0,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))))), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { FileUpload });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FileUpload.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
const {
  useState
} = React;
/* Grupo de opciones excluyentes. Ideal para preguntas de una sola
   respuesta del damnificado (¿hubo heridos?) o filtros del agente. */
function RadioGroup({
  label,
  name,
  options = [],
  value,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  direction = 'vertical'
}) {
  const [focused, setFocused] = useState(null);
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '9px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: direction === 'horizontal' ? 'row' : 'column',
      gap: direction === 'horizontal' ? '20px' : '10px',
      flexWrap: 'wrap'
    }
  }, norm.map(opt => {
    const checked = value === opt.value;
    const isFocused = focused === opt.value;
    const dotBorder = error ? 'var(--danger-500)' : checked ? 'var(--primary-600)' : isFocused ? 'var(--focus-ring)' : 'var(--border-strong)';
    return /*#__PURE__*/React.createElement("label", {
      key: opt.value,
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '11px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "radio",
      name: name,
      value: opt.value,
      checked: checked,
      onChange: () => onChange && onChange(opt.value),
      disabled: disabled,
      onFocus: () => setFocused(opt.value),
      onBlur: () => setFocused(null),
      style: {
        position: 'absolute',
        opacity: 0,
        width: 0,
        height: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 20,
        height: 20,
        borderRadius: 'var(--radius-full)',
        border: `2px solid ${dotBorder}`,
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: isFocused ? 'var(--focus-ring-shadow)' : 'none',
        transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)',
        marginTop: '1px'
      }
    }, checked && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: 'var(--radius-full)',
        background: 'var(--primary-600)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-size)',
        color: 'var(--text-primary)',
        lineHeight: 1.45
      }
    }, opt.label), opt.hint && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-caption-size)',
        color: 'var(--text-tertiary)',
        lineHeight: 1.4
      }
    }, opt.hint)));
  })), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
function Select({
  label,
  options = [],
  value,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  placeholder = 'Seleccionar…',
  id,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--danger-500)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)';
  const focusShadow = focused ? error ? 'var(--focus-ring-shadow-danger)' : 'var(--focus-ring-shadow)' : 'none';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: selectId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: selectId,
    value: value,
    onChange: onChange,
    disabled: disabled,
    required: required,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      width: '100%',
      height: '44px',
      padding: '0 40px 0 14px',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--neutral-100)' : 'var(--bg-inset)',
      boxShadow: focusShadow,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)',
      outline: 'none'
    }
  }, props), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true,
    hidden: true
  }, placeholder), options.map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.value ?? opt,
    value: opt.value ?? opt
  }, opt.label ?? opt))), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--text-tertiary)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }))), (error || hint) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/* Campo de texto largo — pensado para el "relato del siniestro"
   del damnificado: cómodo, con contador opcional y tono calmo. */
function Textarea({
  label,
  placeholder = '',
  value,
  defaultValue,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  rows = 5,
  maxLength,
  showCount = false,
  id,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const [count, setCount] = useState((value ?? defaultValue ?? '').length);
  const areaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--danger-500)' : focused ? 'var(--focus-ring)' : 'var(--border-strong)';
  const focusShadow = focused ? error ? 'var(--focus-ring-shadow-danger)' : 'var(--focus-ring-shadow)' : 'none';
  const handleChange = e => {
    setCount(e.target.value.length);
    onChange && onChange(e);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: areaId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 600,
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("textarea", _extends({
    id: areaId,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: handleChange,
    disabled: disabled,
    required: required,
    rows: rows,
    maxLength: maxLength,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: '100%',
      resize: 'vertical',
      minHeight: 96,
      border: `1.5px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--neutral-100)' : 'var(--bg-inset)',
      boxShadow: focusShadow,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 1.6,
      color: 'var(--text-primary)',
      padding: '12px 14px',
      outline: 'none',
      transition: 'border-color 0.15s var(--ease-standard), box-shadow 0.15s var(--ease-standard)'
    }
  }, props)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px'
    }
  }, error || hint ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption-size)',
      lineHeight: 1.45,
      color: error ? 'var(--danger-600)' : 'var(--text-tertiary)'
    }
  }, error || hint) : /*#__PURE__*/React.createElement("span", null), showCount && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-tertiary)',
      flexShrink: 0
    }
  }, count, maxLength ? ` / ${maxLength}` : '')));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
const Chevron = /*#__PURE__*/React.createElement("svg", {
  width: "14",
  height: "14",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("polyline", {
  points: "9 18 15 12 9 6"
}));

/* Migas de pan: ubicación dentro de la jerarquía (agente). El último
   item es la página actual y no es clickeable. */
function Breadcrumb({
  items = []
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Ruta",
    style: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '4px'
    }
  }, items.map((item, i) => {
    const isLast = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, isLast ? /*#__PURE__*/React.createElement("span", {
      "aria-current": "page",
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-sm-size)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, item.label) : /*#__PURE__*/React.createElement("a", {
      href: item.href || '#',
      onClick: item.onClick,
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-sm-size)',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        textDecoration: 'none',
        cursor: 'pointer'
      }
    }, item.label), !isLast && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-tertiary)',
        display: 'flex'
      }
    }, Chevron));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Header.jsx
try { (() => {
const BackIcon = /*#__PURE__*/React.createElement("svg", {
  width: "20",
  height: "20",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("line", {
  x1: "19",
  y1: "12",
  x2: "5",
  y2: "12"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "12 19 5 12 12 5"
}));

/* Header del Damnificado (mobile-first): back opcional, título
   centrado o a la izquierda, y un slot de acción a la derecha. */
function Header({
  title,
  subtitle,
  onBack,
  right,
  align = 'left'
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      height: 56,
      padding: '0 var(--space-4)',
      width: '100%',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      fontFamily: 'var(--font-sans)'
    }
  }, onBack && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Volver",
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      margin: '0 -4px',
      color: 'var(--text-secondary)',
      lineHeight: 0,
      flexShrink: 0
    }
  }, BackIcon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      textAlign: align,
      display: 'flex',
      flexDirection: 'column',
      gap: '1px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-h4-size)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      lineHeight: 1.25,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-caption-size)',
      color: 'var(--text-tertiary)',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, subtitle)), right ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, right) : onBack && align === 'center' ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      flexShrink: 0
    }
  }) : null);
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Header.jsx", error: String((e && e.message) || e) }); }

// components/navigation/ProgressBar.jsx
try { (() => {
/* Barra de progreso. Determinada (value 0–100) o indeterminada (value
   null). Acompaña al Stepper cuando alcanza con "cuánto falta". */
function ProgressBar({
  value = null,
  max = 100,
  label,
  showValue = false,
  size = 'md'
}) {
  const height = size === 'sm' ? 6 : 10;
  const indeterminate = value === null || value === undefined;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      alignItems: 'baseline'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-sm-size)',
      fontWeight: 500,
      color: 'var(--text-secondary)'
    }
  }, label), showValue && !indeterminate && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--text-tertiary)'
    }
  }, Math.round(pct), "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height,
      background: 'var(--neutral-200)',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      borderRadius: 'var(--radius-full)',
      background: 'var(--primary-600)',
      width: indeterminate ? '40%' : `${pct}%`,
      animation: indeterminate ? 'amparo-progress 1.3s var(--ease-standard) infinite' : 'none',
      transition: indeterminate ? 'none' : 'width var(--dur-slow) var(--ease-standard)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/* Barra lateral del Agente. Navy autoridad (--sidebar-bg), 240px,
   items con ícono + label + contador opcional y footer de usuario. */
function Sidebar({
  brand = 'Amparo',
  items = [],
  activeId,
  onNavigate,
  footer,
  width = 240
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width,
      minHeight: '100%',
      flexShrink: 0,
      background: 'var(--sidebar-bg)',
      color: 'var(--sidebar-text)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      height: 60,
      padding: '0 var(--space-5)',
      borderBottom: '1px solid var(--sidebar-border)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 'var(--radius-md)',
      background: 'var(--primary-500)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 800,
      fontSize: 15,
      flexShrink: 0
    }
  }, "A"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--sidebar-text-strong)',
      letterSpacing: '-0.01em'
    }
  }, brand)), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: 'var(--space-3)',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      overflowY: 'auto'
    }
  }, items.map(item => {
    const active = item.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      type: "button",
      onClick: () => onNavigate && onNavigate(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        width: '100%',
        padding: '9px 12px',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--sidebar-active-bg)' : 'transparent',
        color: active ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        fontWeight: active ? 600 : 500,
        transition: 'background 0.15s var(--ease-standard), color 0.15s var(--ease-standard)'
      }
    }, item.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexShrink: 0,
        opacity: active ? 1 : 0.85
      }
    }, item.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, item.label), item.count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        borderRadius: 'var(--radius-full)',
        background: active ? 'var(--primary-500)' : 'rgba(255,255,255,0.12)',
        color: active ? '#fff' : 'var(--sidebar-text-strong)',
        fontSize: 11,
        fontWeight: 700
      }
    }, item.count));
  })), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-4) var(--space-5)',
      borderTop: '1px solid var(--sidebar-border)',
      flexShrink: 0
    }
  }, footer));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Stepper.jsx
try { (() => {
/* Wizard del damnificado (horizontal) y detalle de pipeline (vertical). */
function Stepper({
  steps = [],
  currentStep = 0,
  variant = 'horizontal'
}) {
  const isH = variant === 'horizontal';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: isH ? 'row' : 'column',
      alignItems: isH ? 'center' : 'flex-start',
      gap: isH ? '0' : 'var(--space-1)',
      width: '100%'
    }
  }, steps.map((step, i) => {
    const isDone = i < currentStep;
    const isActive = i === currentStep;
    const circleBg = isDone ? 'var(--primary-600)' : isActive ? 'var(--primary-50)' : 'var(--bg-surface)';
    const circleBorder = isDone || isActive ? 'var(--primary-600)' : 'var(--border-strong)';
    const labelColor = isActive ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : 'var(--text-tertiary)';
    const connectorColor = isDone ? 'var(--primary-400)' : 'var(--border)';
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: step.id || i
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: isH ? 'column' : 'row',
        alignItems: 'center',
        gap: isH ? 'var(--space-2)' : 'var(--space-3)',
        flexShrink: 0,
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: `2px solid ${circleBorder}`,
        background: circleBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s var(--ease-standard), border-color 0.2s var(--ease-standard)',
        flexShrink: 0
      }
    }, isDone ? /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "white",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("polyline", {
      points: "20 6 9 17 4 12"
    })) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        fontWeight: 700,
        color: isActive ? 'var(--primary-700)' : 'var(--text-tertiary)',
        lineHeight: 1
      }
    }, i + 1)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: isH ? 'center' : 'flex-start',
        gap: '2px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-sm-size)',
        fontWeight: isActive ? 600 : 500,
        color: labelColor,
        whiteSpace: 'nowrap',
        transition: 'color 0.2s var(--ease-standard)'
      }
    }, step.label), step.description && isActive && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-caption-size)',
        color: 'var(--text-tertiary)'
      }
    }, step.description))), i < steps.length - 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        flex: isH ? 1 : undefined,
        height: isH ? 2 : undefined,
        width: isH ? undefined : 2,
        minHeight: isH ? undefined : 'var(--space-6)',
        background: connectorColor,
        marginLeft: isH ? 'var(--space-2)' : '16px',
        marginRight: isH ? 'var(--space-2)' : undefined,
        transition: 'background 0.2s var(--ease-standard)',
        alignSelf: isH ? 'center' : undefined
      }
    }));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items = [],
  activeTab,
  onChange,
  variant = 'underline'
}) {
  const isUnderline = variant === 'underline';
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: isUnderline ? '0' : 'var(--space-1)',
      borderBottom: isUnderline ? '1px solid var(--border)' : 'none',
      background: isUnderline ? 'transparent' : 'var(--neutral-100)',
      padding: isUnderline ? '0' : 'var(--space-1)',
      borderRadius: isUnderline ? '0' : 'var(--radius-md)'
    }
  }, items.map(item => {
    const isActive = item.id === activeTab;
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      onClick: () => onChange && onChange(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: isUnderline ? 'var(--space-3) var(--space-4)' : 'var(--space-2) var(--space-4)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-sm-size)',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? isUnderline ? 'var(--primary-700)' : 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive && !isUnderline ? 'var(--bg-surface)' : 'transparent',
        border: 'none',
        borderBottom: isUnderline ? `2px solid ${isActive ? 'var(--primary-600)' : 'transparent'}` : 'none',
        borderRadius: isUnderline ? '0' : 'var(--radius-sm)',
        cursor: 'pointer',
        transition: 'color 0.15s var(--ease-standard), background 0.15s var(--ease-standard)',
        boxShadow: isActive && !isUnderline ? 'var(--shadow-xs)' : 'none',
        whiteSpace: 'nowrap',
        marginBottom: isUnderline ? '-1px' : '0'
      }
    }, item.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex'
      }
    }, item.icon), item.label, item.count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '19px',
        height: '19px',
        padding: '0 6px',
        borderRadius: 'var(--radius-full)',
        background: isActive ? 'var(--primary-100)' : 'var(--neutral-200)',
        color: isActive ? 'var(--primary-700)' : 'var(--text-secondary)',
        fontSize: '11px',
        fontWeight: 700
      }
    }, item.count));
  })), items.map(item => item.id === activeTab ? /*#__PURE__*/React.createElement("div", {
    key: item.id,
    style: {
      paddingTop: isUnderline ? 'var(--space-4)' : 'var(--space-3)'
    }
  }, item.content) : null));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Drawer = __ds_scope.Drawer;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.DatePicker = __ds_scope.DatePicker;

__ds_ns.FileUpload = __ds_scope.FileUpload;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Header = __ds_scope.Header;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
