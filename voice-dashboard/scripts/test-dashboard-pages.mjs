import assert from 'node:assert/strict';
import { removePageCardReferences } from '../src/dataStudio/dashboardPages.ts';
const cards = [
  { id:'a', pageId:'first', mappings:[{targetCardId:'b',targetColumn:'hospital'}] },
  { id:'b', pageId:'second', mappings:[{targetCardId:'a',targetColumn:'branch'}] },
  { id:'c', pageId:'second', mappings:[{targetCardId:'b',targetColumn:'year'}] },
];
const result = removePageCardReferences(cards, 'first');
assert.deepEqual([...result.removedIds], ['a']);
assert.deepEqual(result.cards.map(card => card.id), ['b','c']);
assert.deepEqual(result.cards[0].mappings, []);
assert.deepEqual(result.cards[1].mappings, [{targetCardId:'b',targetColumn:'year'}]);
assert.equal(cards[1].mappings.length, 1);
assert.equal(removePageCardReferences(cards, 'missing').cards.length, 3);
console.log('Dashboard page reference tests passed.');
