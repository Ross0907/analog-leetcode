import assert from 'node:assert/strict';
import test from 'node:test';
import { challenges } from '../lib/challenges';
import { textbookLessonSources } from '../lib/native-lesson-format';
import { curriculumVariants } from './fixtures/curriculum-witnesses';

test('every catalogue lesson declares native circuits, real probes and a bounded useful acquisition window', () => {
  assert.equal(challenges.length, 41);
  for (const lesson of challenges) {
    assert.ok(lesson.nativeCircuit?.startsWith('$ '), lesson.slug);
    assert.doesNotMatch(lesson.nativeCircuit!, /^R /m, 'authored rail supplies use vertical source/ground returns');
    assert.ok(lesson.analysisDefaults!.duration! > 0 && lesson.analysisDefaults!.samples! <= 131072, lesson.slug);
    for (const name of lesson.recommendedProbes!) assert.ok(lesson.nativeCircuit!.split('\n').some(line => line.startsWith('207 ') && line.endsWith(' ' + name)), `${lesson.slug}: ${name}`);
    if (lesson.analysis === 'Operating point') assert.equal(lesson.preferredInstrument, 'dc');
    if (lesson.analysis === 'Transient') assert.equal(lesson.acquisitionMode, 'restart-record');
    if (lesson.designChecks?.length) assert.equal(curriculumVariants(lesson).length, 2, 'design tasks have an actual edited native solution witness');
    for (const prerequisite of lesson.prerequisites ?? []) assert.ok(challenges.some(item=>item.slug===prerequisite), `${lesson.slug}: missing ${prerequisite}`);
  }
});

test('authored source banks use two columns and preserve floating source terminals and element indices', () => {
  const original = '$ 1 .000001 10 50 5 50\n' + Array.from({length:5},(_,index)=>`R ${index*96} 128 ${index*96} 64 0 0 40 ${index} 0 0 .5`).join('\n') + '\nv 240 288 384 288 0 0 40 .02 0 0 .5\n';
  const formatted = textbookLessonSources(original).trim().split('\n');
  const sources = formatted.slice(1,6).map(line=>line.split(' '));
  assert.equal(new Set(sources.map(fields=>fields[1])).size,2);
  for (let index=0;index<sources.length;index++) {
    const fields=sources[index];
    assert.equal(fields[0],'v'); assert.equal(fields[1],fields[3]); assert.equal(Number(fields[2])-Number(fields[4]),128); assert.equal(fields[8],String(index));
    assert.ok(formatted.some(line=>line.startsWith(`g ${fields[1]} ${fields[2]} `)));
  }
  assert.equal(formatted[6], 'v 240 288 384 288 0 0 40 .02 0 0 .5', 'floating trim source must never be grounded');
});
