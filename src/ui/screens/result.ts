import type { EndingDef } from '../../rules/endings.ts';
import type { ScoreResult } from '../../rules/scoring.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** Inputs to the result screen. */
export interface ResultOptions {
  t: Translate;
  score: ScoreResult;
  ending: EndingDef;
  /** The ending was just added to the codex. */
  newEnding: boolean;
  /** Codex fill: endings / fusions found vs. existing. */
  codex: { endings: number; endingsMax: number; fusions: number; fusionsMax: number };
  hp: number;
  /** hp needed for the 2nd star, score needed for the 3rd. */
  hpStar: number;
  star3: number;
  /** Name of a character that has not cleared this map yet, else null. */
  otherCharName: string | null;
  onReplay(): void;
  /** Absent when there is no other character. */
  onOtherChar?: () => void;
  /** Absent on the last map. */
  onNextMap?: () => void;
  onMaps(): void;
}

const button = (cls: string, label: string, on: () => void): HTMLButtonElement => {
  const b = el('button', cls, label);
  b.setAttribute('aria-label', label);
  b.addEventListener('click', on);
  return b;
};

/**
 * Clear result screen (docs/DETAILED_DESIGN_V2.md 15.5, Story 006): [같은 맵 다시] on top, then the
 * ending with its two epilogue cards (gained / lost), the itemized score (zero items hidden,
 * spec 8 order), the stars and one "next goal" card, then the other buttons. One mobile screen.
 * @example mountResult(root, { t, score, ending, ... });
 */
export function mountResult(root: HTMLElement, o: ResultOptions): HTMLElement {
  const { t, score } = o;
  const box = el('section', 'result');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('result.title'));
  box.appendChild(button('res-replay', t('result.replay'), o.onReplay));

  const head = el('div', 'res-head');
  head.append(el('span', 'res-kicker', t('result.title')), el('h1', '', t(`${o.ending.i18n}.title`)));
  if (o.newEnding) head.appendChild(el('span', 'badge res-new', t('result.newEnding')));
  box.appendChild(head);

  const cards = el('div', 'res-cards');
  for (const side of ['gained', 'lost'] as const) {
    const c = el('section', `epi ${side}`);
    c.append(el('h2', '', t(`result.${side}`)), el('p', '', t(`${o.ending.i18n}.${side}`)));
    cards.appendChild(c);
  }
  box.appendChild(cards);

  const table = el('table', 'res-score');
  table.appendChild(el('caption', 'sr', t('result.scoreCaption')));
  const body = el('tbody');
  for (const it of score.items) {
    if (it.value === 0) continue;
    const tr = el('tr');
    const label = it.key === 'build' ? `score.build.${score.buildType}` : `score.${it.key}`;
    tr.append(el('th', '', t(label)), el('td', '', `+${it.value}`));
    body.appendChild(tr);
  }
  const total = el('tr', 'total');
  total.append(el('th', '', t('result.total')), el('td', '', String(score.total)));
  body.appendChild(total);
  table.appendChild(body);
  box.appendChild(table);

  const stars = el('p', 'res-stars', '★'.repeat(score.stars) + '☆'.repeat(3 - score.stars));
  stars.setAttribute('aria-label', t('result.stars', { n: score.stars }));
  box.appendChild(stars);

  const goal = el('section', 'res-goal');
  const goalText =
    o.hp < o.hpStar ? t('goal.hp', { n: o.hpStar })
      : score.total < o.star3 ? t('goal.score', { n: o.star3 })
        : o.otherCharName !== null ? t('goal.otherChar', { name: o.otherCharName })
          : t('goal.nextMap');
  goal.append(el('h2', '', t('goal.title')), el('p', '', goalText), el('p', 'res-codex', t('result.codex', o.codex)));
  box.appendChild(goal);

  const foot = el('div', 'res-foot');
  if (o.onOtherChar) foot.appendChild(button('', t('result.otherChar'), o.onOtherChar));
  if (o.onNextMap) foot.appendChild(button('', t('result.nextMap'), o.onNextMap));
  foot.appendChild(button('', t('result.toMaps'), o.onMaps));
  box.appendChild(foot);
  root.appendChild(box);
  return box;
}
