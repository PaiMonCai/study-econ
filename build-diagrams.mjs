const fields = new Set(['prompt_md', 'outline_md', 'answer_md']);
const modes = new Set(['numeric', 'schematic', 'structure']);
const roles = new Set(['base', 'change', 'reference', 'area']);
const identifier = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const stage = value => Number.isInteger(value) && value >= 0 && value <= 2;
const fail = (id, message) => { throw new Error('Invalid diagram ' + id + ': ' + message); };

export function validateDiagram(diagram, question) {
 const id = diagram?.id || question.id;
 const require = (condition, message) => { if (!condition) fail(id, message); };
 require(identifier(diagram?.id) && diagram.question_id === question.id, 'question or diagram identity');
 require(text(diagram.title) && text(diagram.intro) && modes.has(diagram.mode), 'title, introduction or mode');
 require(fields.has(diagram.source?.field) && text(diagram.source.quote) && question[diagram.source.field].includes(diagram.source.quote), 'source quotation must match the original question');
 require(Array.isArray(diagram.stages) && diagram.stages.length === 3 && diagram.stages.every(s => text(s.title) && text(s.explanation) && Array.isArray(s.checklist) && s.checklist.length > 0 && s.checklist.every(text)), 'three explained stages and drawing checks');
 require(Array.isArray(diagram.notes) && diagram.notes.length > 0 && diagram.notes.every(text), 'conditions and interpretation notes');
 if (diagram.mode === 'schematic') require(/示意/.test(diagram.intro + diagram.notes.join('')), 'schematic scope must be explicit');
 const kind = diagram.kind || 'plot';
 require(['plot', 'flow'].includes(kind), 'supported diagram kind');
 if (kind === 'flow') {
  require(Array.isArray(diagram.nodes) && diagram.nodes.length >= 2 && diagram.nodes.length <= 9, 'two to nine flow nodes');
  const nodeIds = new Set(), cells = new Set();
  for (const node of diagram.nodes) {
   require(identifier(node.id) && !nodeIds.has(node.id) && text(node.label) && (!node.detail || text(node.detail)) && stage(node.stage), 'unique flow node and explained stage');
   require(Number.isInteger(node.column) && node.column >= 0 && node.column <= 2 && Number.isInteger(node.row) && node.row >= 0 && node.row <= 2, 'flow cell');
   const cell = node.column + ':' + node.row;
   require(!cells.has(cell), 'flow nodes must not overlap');
   cells.add(cell); nodeIds.add(node.id);
  }
  require(Array.isArray(diagram.edges) && diagram.edges.length > 0, 'flow relationships');
  for (const edge of diagram.edges) {
   const from = diagram.nodes.find(n => n.id === edge.from), to = diagram.nodes.find(n => n.id === edge.to);
   require(from && to && from !== to && stage(edge.stage) && edge.stage >= from.stage && edge.stage >= to.stage && (!edge.label || text(edge.label)), 'visible edge endpoints');
  }
  require(diagram.nodes.some(n => n.stage === 0), 'initial visible flow');
 } else {
  for (const axis of ['x', 'y']) require(text(diagram.axes?.[axis]?.label) && Number.isFinite(diagram.axes[axis].min) && Number.isFinite(diagram.axes[axis].max) && diagram.axes[axis].min < diagram.axes[axis].max, 'finite ' + axis + ' axis');
  const coordinate = pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite) && pair[0] >= diagram.axes.x.min - 1e-8 && pair[0] <= diagram.axes.x.max + 1e-8 && pair[1] >= diagram.axes.y.min - 1e-8 && pair[1] <= diagram.axes.y.max + 1e-8;
  require(Array.isArray(diagram.series) && diagram.series.length > 0, 'plotted relationships');
  const seriesIds = new Set();
  for (const series of diagram.series) {
   require(identifier(series.id) && !seriesIds.has(series.id) && text(series.label) && roles.has(series.role) && stage(series.stage), 'unique series, label and stage');
   require(Array.isArray(series.points) && series.points.length >= 2 && series.points.every(coordinate), 'series coordinates within axis bounds');
   require(series.closed === undefined || typeof series.closed === 'boolean', 'closed series flag');
   require(series.dashed === undefined || typeof series.dashed === 'boolean', 'dashed series flag');
   seriesIds.add(series.id);
  }
  const pointIds = new Set();
  require(Array.isArray(diagram.points), 'key points');
  for (const point of diagram.points) {
   require(identifier(point.id) && !pointIds.has(point.id) && coordinate([point.x, point.y]) && text(point.label) && stage(point.stage), 'unique key points in bounds');
   require(['dx', 'dy'].every(key => point[key] === undefined || Number.isFinite(point[key]) && Math.abs(point[key]) <= 680), 'finite point-label offset');
   pointIds.add(point.id);
  }
  for (const label of diagram.labels || []) require(coordinate([label.x, label.y]) && text(label.text) && stage(label.stage), 'plot label');
  for (const arrow of diagram.arrows || []) require(coordinate(arrow.from) && coordinate(arrow.to) && stage(arrow.stage) && (!arrow.label || text(arrow.label)), 'plot arrow');
  require(diagram.series.some(s => s.stage === 0), 'initial plotted relationship');
 }
 return diagram;
}

export function prepareDiagrams(bank, subject, questions) {
 const require = (condition, message) => { if (!condition) throw new Error('Invalid ' + subject + ' diagram bank: ' + message); };
 require(bank?.version === 1 && bank.subject === subject, 'version or subject');
 require(Array.isArray(bank.coverage) && bank.coverage.length === questions.length, 'every question needs an explicit coverage decision');
 require(Array.isArray(bank.diagrams), 'diagram collection');
 const byId = new Map(questions.map(q => [q.id, q])), decisions = new Map(), diagrams = new Map(), ids = new Set();
 for (const item of bank.coverage) {
  require(byId.has(item.question_id) && !decisions.has(item.question_id) && ['diagram', 'text'].includes(item.decision) && text(item.reason), 'unique, explained coverage decision');
  decisions.set(item.question_id, item);
 }
 for (const diagram of bank.diagrams) {
  require(byId.has(diagram.question_id) && !ids.has(diagram.id), 'unique diagram with known question');
  validateDiagram(diagram, byId.get(diagram.question_id));
  ids.add(diagram.id);
  const list = diagrams.get(diagram.question_id) || [];
  list.push(diagram); diagrams.set(diagram.question_id, list);
 }
 for (const [qid, decision] of decisions) require((decision.decision === 'diagram') === diagrams.has(qid), 'coverage and graph correspondence: ' + qid);
 return diagrams;
}
