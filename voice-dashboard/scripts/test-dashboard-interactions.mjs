import assert from 'node:assert/strict';
import { dashboardQuery } from '../src/dataStudio/dashboardInteractions.ts';

const config = { dimension: 'year', filters: [{column:'status',operator:'eq',value:'active'}] };
const mappings = [{ sourceCardId:'hospital', mappings:[{targetCardId:'revenue',targetColumn:'hospital_id'}] }];
const columns = ['year', 'month', 'hospital_id', 'status'];
const query = dashboardQuery(config, 'revenue', columns, mappings, [{sourceCardId:'hospital',value:'A'}], ['year','month'], [{column:'year',value:'2026'}]);
assert.equal(query.dimension, 'month');
assert.deepEqual(query.filters, [config.filters[0], {column:'hospital_id',operator:'eq',value:'A'}, {column:'year',operator:'eq',value:'2026'}]);
assert.equal(config.dimension, 'year');
assert.equal(config.filters.length, 1);
assert.equal(dashboardQuery(config, 'other', columns, mappings, [{sourceCardId:'hospital',value:'A'}], [], []).filters.length, 1);
assert.throws(() => dashboardQuery(config, 'revenue', columns, mappings, [{sourceCardId:'hospital',value:'(NULL)'}], [], []), /AMBIGUOUS_SELECTION/);
assert.throws(() => dashboardQuery(config, 'revenue', [], mappings, [{sourceCardId:'hospital',value:'A'}], [], []), /INVALID_TARGET_COLUMN/);
assert.throws(() => dashboardQuery(config, 'revenue', columns, [], [], ['year','month'], [{column:'month',value:'1'}]), /INVALID_DRILL_STEP/);
assert.throws(() => dashboardQuery({...config, filters:Array(8).fill(config.filters[0])}, 'revenue', columns, mappings, [{sourceCardId:'hospital',value:'A'}], [], []), /TOO_MANY_FILTERS/);
const dates = [{sourceCardId:'date', mappings:[{targetCardId:'revenue',targetColumn:'year'}]}];
assert.deepEqual(dashboardQuery(config, 'revenue', columns, dates, [{sourceCardId:'date',from:'2024-02-28',to:'2024-02-29'}], [], []).filters.slice(1), [
  {column:'year',operator:'gte',value:'2024-02-28'}, {column:'year',operator:'lt',value:'2024-03-01'},
]);
assert.throws(() => dashboardQuery(config, 'revenue', columns, dates, [{sourceCardId:'date',from:'2024-03-01',to:'2024-02-29'}], [], []), /INVALID_DATE_RANGE/);
assert.throws(() => dashboardQuery(config, 'revenue', columns, dates, [{sourceCardId:'date',to:'2024-02-30'}], [], []), /INVALID_DATE_RANGE/);
assert.throws(() => dashboardQuery(config, 'revenue', columns, dates, [{sourceCardId:'date',to:'9999-12-31'}], [], []), /INVALID_DATE_RANGE/);
console.log('Dashboard interaction query tests passed.');
