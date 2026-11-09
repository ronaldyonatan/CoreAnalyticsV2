import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScience, SCIENCE_STEPS, scienceExample, compileScienceTraining } from '../src/dataStudio/dataSciencePreview.ts';
import { compilePreview, PREVIEW_STEPS } from '../src/dataStudio/pipelinePreview.ts';
import { compileGraph } from '../src/dataStudio/graphPreview.ts';
for (const label of SCIENCE_STEPS.filter(s => s !== 'AutoML Inference')) test(`${label}: graph example reaches Spark with propagated output schema`, () => {
  const { nodes, edges } = scienceExample(label), graph = compilePreview(nodes, edges);
  assert.ok(PREVIEW_STEPS.includes(label));
  assert.equal(graph.url, '/voice-api/api/studio/datasets/graph-spark-preview');
  assert.equal(graph.body.nodes[0].steps[0].type, 'data_science');
  if (['Classification', 'Prediction'].includes(label)) {
    assert.equal(graph.body.nodes[0].inputs.length, 2);
    assert.deepEqual(graph.body.nodes[0].inputs.map(r => r.node), ['science-train', 'science-test']);
    assert.deepEqual(graph.ports.science.main, ['X', label === 'Classification' ? 'classification' : 'prediction']);
    const bad = edges.map(e => e.targetHandle === 'train' ? { ...e, targetHandle: 'predict' } : e);
    assert.throws(() => compileGraph(nodes, bad), /Training/);
    const self = compileGraph(nodes.filter(n => n.id !== 'science-test'), edges.filter(e => e.source !== 'science-test'));
    assert.equal(self.body.nodes[0].inputs.length, 1);
  }
});
test('reject target leakage, unavailable Predict features, duplicate outputs and invalid parameters', () => {
  const data = (label, values) => ({ label, utilityConfig: { values } });
  assert.throws(() => compileScience(data('Prediction', { target: 'Y', numeric: '["Y"]' }), ['X','Y']), /Target/);
  assert.throws(() => compileScience(data('Prediction', { target: 'Y', numeric: '["X"]' }), ['X','Y'], ['Z']), /Predict/);
  assert.throws(() => compileScience(data('Clustering', { features: '["X"]', output: 'x' }), ['X']), /unik/);
  assert.throws(() => compileScience(data('Clustering', { features: '["X"]', count: '2.5' }), ['X']), /bilangan bulat/);
  assert.throws(() => compileScience(data('Multivariate Outliers', { features: '["X"]', cutoff: '1' }), ['X']), /kurang/);
  assert.throws(() => compileScience(data('Forecasting', { time: 'T', target: 'Y', periods: '20', history: '40' }), ['T', 'Y']), /maksimal 50/);
});
test('AutoML requires trained model and matching features; training compiles only ancestors', () => {
  const { nodes, edges } = scienceExample('AutoML Inference');
  assert.throws(() => compileGraph(nodes, edges), /model/);
  const { nodes: training, edges: trainingEdges } = compileScienceTraining(nodes, edges, 'science');
  const graph = compileGraph(training, trainingEdges);
  assert.equal(graph.body.nodes.length, 0); assert.equal(graph.body.outputs.length, 1);
  const values = { model_id: '00000000-0000-4000-8000-000000000001', modelFeatures: '["X"]' };
  assert.deepEqual(compileScience({ label: 'AutoML Inference', utilityConfig: { values } }, ['X']).columns, ['X', 'prediction']);
  assert.throws(() => compileScience({ label: 'AutoML Inference', utilityConfig: { values } }, ['Z']), /fitur/);
  const cyclic = [...edges, { source: 'science-train', target: 'science-train' }];
  assert.throws(() => compileScienceTraining(nodes, cyclic, 'science'), /cycle/);
});
