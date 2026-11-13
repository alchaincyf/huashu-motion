// Studio UI strings. One flat dictionary per language; `zh` is the reference set, the others must
// cover every key (test/i18n.test.js checks). Placeholders are {name}; {kbd} becomes a <kbd> element.
export const LANGS = {
  zh: {
    name: '中文',
    'status.connecting': '连接中',
    'status.disconnected': '与 studio 断开，重新运行 om studio',
    'status.exporting': '正在导出视频…',
    'status.agentWorking': 'Agent 正在改：{text}',
    'status.waiting': '{n} 条评论等 Agent 接单',
    'status.saved': '已保存 · 第 {n} 版',
    'undo': '撤回',
    'undo.title': '撤回到上一版 (⌘Z)',
    'undo.done': '已撤回到上一版',
    'undo.nothing': '没有可以撤回的版本',
    'export': '导出视频',
    'export.mp4': 'MP4 视频',
    'export.mov': 'MOV（透明底）',
    'export.gif': 'GIF 动图',
    'export.running': '正在导出 {format}…',
    'export.firstTime': '首次导出会下载渲染器，需要几分钟',
    'export.done': '导出完成：',
    'export.failed': '导出失败：',
    'tools': '工具',
    'tool.select': '选择 (V)',
    'tool.comment': '在画面上留言给 Agent (C)',
    'composer.placeholder': '告诉 Agent 这里要怎么改，比如：这里多停一拍',
    'composer.hint': '⌘↩ 发送 · Esc 取消',
    'composer.send': '发给 Agent',
    'composer.sent': '已发给 Agent。它接单后，这里会显示进度。',
    'composer.scene': '场景',
    'agent.none': '还没有 Agent 在接单。',
    'agent.none.body': '在你的 Agent 里说「处理 huashu-motion 的评论」，或在终端运行：',
    'copy': '复制',
    'copied': '已复制',
    'tab.props': '参数',
    'tab.comments': '评论',
    'selection.empty': '点画面里的元素查看它，双击文字直接改；按 {kbd} 在画面上给 Agent 留言。',
    'selection.canvas': '画布',
    'selection.comment': '留言给 Agent',
    'selection.editable': '可直接改：{list}',
    'selection.unbound': '这个元素没有绑定参数，留言让 Agent 改。',
    'edit.unbound': '这段文字没有绑定参数，按 C 留言让 Agent 改',
    'edit.conflict': '文件刚被 Agent 改过，已载入最新版本，请再改一次。',
    'list.sep': '、',
    'comment.pending': '待处理',
    'comment.working': 'Agent 正在改',
    'comment.done': '已完成',
    'comment.cancelled': '已取消',
    'comment.handled': '已处理',
    'comment.cancel': '取消',
    'comment.notRight': '没改对',
    'comments.empty': '还没有评论。按 C，再点画面上想改的地方。',
    'reply.placeholder': '哪里还不对？比如：再慢一点，或者换成蓝色',
    'reply.hint': '⌘↩ 发送',
    'reply.send': '发回给 Agent',
    'reply.sent': '已发回给 Agent',
    'vars.none': '这个工程还没有可直接改的参数。让 Agent 把标题、数字、颜色声明成变量（data-composition-variables），这里就会出现输入框。',
    'vars.group': '画面参数',
    'scenes.none': '没有分镜标签。时间轴上加 tl.addLabel("scene:名字", 秒)，这里就会分段。',
    'play.title': '播放 / 暂停 (空格)',
    'shortcuts': '空格 播放 · ←→ 逐帧 · C 留言 · ⌘Z 撤回',
    'boot.failed': 'studio 启动失败：',
    'lang.title': '界面语言',
  },
  en: {
    name: 'English',
    'status.connecting': 'Connecting',
    'status.disconnected': 'Disconnected from the studio — run om studio again',
    'status.exporting': 'Exporting video…',
    'status.agentWorking': 'Agent is working: {text}',
    'status.waiting': '{n} comment(s) waiting for an agent',
    'status.saved': 'Saved · version {n}',
    'undo': 'Undo',
    'undo.title': 'Back to the previous version (⌘Z)',
    'undo.done': 'Back to the previous version',
    'undo.nothing': 'Nothing to undo',
    'export': 'Export video',
    'export.mp4': 'MP4 video',
    'export.mov': 'MOV (transparent)',
    'export.gif': 'Animated GIF',
    'export.running': 'Exporting {format}…',
    'export.firstTime': 'The first export downloads the renderer and takes a few minutes',
    'export.done': 'Export finished: ',
    'export.failed': 'Export failed: ',
    'tools': 'Tools',
    'tool.select': 'Select (V)',
    'tool.comment': 'Leave the agent a note on the frame (C)',
    'composer.placeholder': 'Tell the agent what to change here, e.g. hold a beat longer',
    'composer.hint': '⌘↩ send · Esc cancel',
    'composer.send': 'Send to agent',
    'composer.sent': 'Sent to the agent. Progress shows here once it picks it up.',
    'composer.scene': 'scene',
    'agent.none': 'No agent is listening yet.',
    'agent.none.body': 'Tell your agent "handle the huashu-motion comments", or run in a terminal:',
    'copy': 'Copy',
    'copied': 'Copied',
    'tab.props': 'Parameters',
    'tab.comments': 'Comments',
    'selection.empty': 'Click an element in the frame to inspect it, double-click text to edit it; press {kbd} to leave the agent a note on the frame.',
    'selection.canvas': 'canvas',
    'selection.comment': 'Note to agent',
    'selection.editable': 'Editable here: {list}',
    'selection.unbound': 'This element is not bound to a parameter — leave the agent a note.',
    'edit.unbound': 'This text is not bound to a parameter — press C and ask the agent',
    'edit.conflict': 'The agent just changed the file; the latest version was loaded, please make the change again.',
    'list.sep': ', ',
    'comment.pending': 'Pending',
    'comment.working': 'Agent working',
    'comment.done': 'Done',
    'comment.cancelled': 'Cancelled',
    'comment.handled': 'Handled',
    'comment.cancel': 'Cancel',
    'comment.notRight': 'Not right yet',
    'comments.empty': 'No comments yet. Press C, then click the spot in the frame you want changed.',
    'reply.placeholder': 'What is still off? e.g. slower, or make it blue',
    'reply.hint': '⌘↩ send',
    'reply.send': 'Send back to agent',
    'reply.sent': 'Sent back to the agent',
    'vars.none': 'This project has no directly editable parameters yet. Ask the agent to declare titles, numbers and colours as variables (data-composition-variables) and fields will appear here.',
    'vars.group': 'Frame parameters',
    'scenes.none': 'No scene labels. Add tl.addLabel("scene:name", seconds) on the timeline and sections will show here.',
    'play.title': 'Play / pause (space)',
    'shortcuts': 'Space play · ←→ frame step · C note · ⌘Z undo',
    'boot.failed': 'The studio failed to start: ',
    'lang.title': 'Interface language',
  },
  es: {
    name: 'Español',
    'status.connecting': 'Conectando',
    'status.disconnected': 'Desconectado del studio, vuelve a correr om studio',
    'status.exporting': 'Exportando video…',
    'status.agentWorking': 'El agente está trabajando: {text}',
    'status.waiting': '{n} comentario(s) esperando al agente',
    'status.saved': 'Guardado · versión {n}',
    'undo': 'Deshacer',
    'undo.title': 'Volver a la versión anterior (⌘Z)',
    'undo.done': 'Se volvió a la versión anterior',
    'undo.nothing': 'No hay una versión anterior',
    'export': 'Exportar video',
    'export.mp4': 'Video MP4',
    'export.mov': 'MOV (fondo transparente)',
    'export.gif': 'GIF animado',
    'export.running': 'Exportando {format}…',
    'export.firstTime': 'La primera exportación descarga el renderizador y tarda unos minutos',
    'export.done': 'Exportación lista: ',
    'export.failed': 'Falló la exportación: ',
    'tools': 'Herramientas',
    'tool.select': 'Seleccionar (V)',
    'tool.comment': 'Dejar una nota al agente sobre el cuadro (C)',
    'composer.placeholder': 'Dile al agente qué cambiar aquí, por ejemplo: que se detenga un poco más',
    'composer.hint': '⌘↩ enviar · Esc cancelar',
    'composer.send': 'Enviar al agente',
    'composer.sent': 'Enviado al agente. Cuando lo tome, aquí verás el avance.',
    'composer.scene': 'escena',
    'agent.none': 'Ningún agente está escuchando todavía.',
    'agent.none.body': 'Dile a tu agente "atiende los comentarios de huashu-motion" o corre en la terminal:',
    'copy': 'Copiar',
    'copied': 'Copiado',
    'tab.props': 'Parámetros',
    'tab.comments': 'Comentarios',
    'selection.empty': 'Haz clic en un elemento del cuadro para verlo, doble clic en un texto para editarlo; pulsa {kbd} para dejarle una nota al agente sobre el cuadro.',
    'selection.canvas': 'lienzo',
    'selection.comment': 'Nota al agente',
    'selection.editable': 'Editable aquí: {list}',
    'selection.unbound': 'Este elemento no está ligado a un parámetro; déjale una nota al agente.',
    'edit.unbound': 'Este texto no está ligado a un parámetro; pulsa C y pídele el cambio al agente',
    'edit.conflict': 'El agente acaba de modificar el archivo; se cargó la versión más reciente, vuelve a hacer el cambio.',
    'list.sep': ', ',
    'comment.pending': 'Pendiente',
    'comment.working': 'El agente está trabajando',
    'comment.done': 'Hecho',
    'comment.cancelled': 'Cancelado',
    'comment.handled': 'Atendido',
    'comment.cancel': 'Cancelar',
    'comment.notRight': 'No quedó bien',
    'comments.empty': 'Aún no hay comentarios. Pulsa C y haz clic en la parte del cuadro que quieras cambiar.',
    'reply.placeholder': '¿Qué sigue mal? Por ejemplo: más lento, o cámbialo a azul',
    'reply.hint': '⌘↩ enviar',
    'reply.send': 'Devolver al agente',
    'reply.sent': 'Devuelto al agente',
    'vars.none': 'Este proyecto aún no tiene parámetros editables. Pídele al agente que declare títulos, números y colores como variables (data-composition-variables) y aquí aparecerán los campos.',
    'vars.group': 'Parámetros del cuadro',
    'scenes.none': 'Sin etiquetas de escena. Agrega tl.addLabel("scene:nombre", segundos) en la línea de tiempo y aquí se verán las secciones.',
    'play.title': 'Reproducir / pausar (espacio)',
    'shortcuts': 'Espacio reproducir · ←→ cuadro a cuadro · C nota · ⌘Z deshacer',
    'boot.failed': 'El studio no pudo iniciar: ',
    'lang.title': 'Idioma de la interfaz',
  },
};

const STORE = 'om-lang';

// Order: ?lang= in the URL, the choice saved in this browser, --lang / OM_LANG from the server, then the browser's languages.
export function pickLang(boot = {}, nav = globalThis.navigator) {
  const url = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  const wanted = [url, saved, boot.lang, ...(nav?.languages || [nav?.language])].filter(Boolean);
  for (const w of wanted) {
    const code = String(w).toLowerCase();
    if (LANGS[code]) return code;
    const base = code.split(/[-_]/)[0];
    if (LANGS[base]) return base;
  }
  return 'en';
}

export function saveLang(code) {
  try { localStorage.setItem(STORE, code); } catch {}
}

let current = 'zh';
export function setLang(code) { current = LANGS[code] ? code : 'en'; return current; }
export function lang() { return current; }

export function t(key, vars = {}) {
  const s = LANGS[current]?.[key] ?? LANGS.zh[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

// Fills the static page: data-i18n (text), data-i18n-title, data-i18n-placeholder, data-i18n-aria,
// and data-i18n-html, whose {kbd} placeholder becomes <kbd>C</kbd>.
export function applyI18n(root = document) {
  root.documentElement && (root.documentElement.lang = current);
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
  for (const n of root.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
  for (const n of root.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
  for (const n of root.querySelectorAll('[data-i18n-html]')) n.innerHTML = t(n.dataset.i18nHtml).replace('{kbd}', '<kbd>C</kbd>');
}
