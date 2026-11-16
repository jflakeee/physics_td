/**
 * Level-up card screen (docs/DETAILED_DESIGN_V2.md 15.4, docs/GAME_DESIGN_V2.md 9.4): a full-screen
 * overlay with 3 cards (own/cross tag, rarity border, fusion badge), skip, reroll, the odds panel
 * and the replace sheet for a full active bar. Shown at wave-end settlement while level-ups are
 * pending; it repeats until none are left. Logic lives in rules/cards.ts.
 */
import type { Run } from '../../game/machine.ts';
import { needsReplace, ownedActives, pickCard, currentOffer, reroll, skipCard } from '../../rules/cards.ts';
import type { Card } from '../../rules/cards.ts';
import { draftLevel, drafting } from '../../rules/leveling.ts';
import type { SkillDef } from '../../rules/skills.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** Inputs of the level-up screen. */
export interface LevelUpOptions {
  run: Run;
  t: Translate;
  /** Text shown above the cards (tutorial hint) or null. */
  hint(): string | null;
  /** A card was picked (the owned skills may have changed). */
  onPick(): void;
  /** No level-ups are pending any more; the overlay closed. */
  onDone(): void;
}

/** Level-up screen handle. */
export interface LevelUp {
  /** Show the screen if level-ups are pending. */
  open(): void;
}

/**
 * Mount the level-up overlay into `root` (hidden until `open`).
 * @example const lv = mountLevelUp(root, { run, t, hint, onPick, onDone }); lv.open();
 */
export function mountLevelUp(root: HTMLElement, o: LevelUpOptions): LevelUp {
  const { run, t } = o;
  const box = el('section', 'lvup');
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('levelup.header', { from: '', to: '' }));
  root.appendChild(box);
  let showOdds = false;
  let note = '';

  const skillDef = (id: string): SkillDef => run.rt.data.skills.get(id) as SkillDef;

  function cardButton(card: Card, index: number): HTMLButtonElement {
    const b = el('button', `lvcard r-${card.rarity ?? 'none'}`);
    const top = el('div', 'top');
    if (card.source === 'fallback') {
      top.append(el('span', '', t('levelup.fallback')));
      const f = (run.draftData?.rules.cards.fallback ?? []).find((x) => x.id === card.id);
      b.append(top, el('span', 'nm', t(`card.${card.id}.name`)), el('span', 'ds', t(`card.${card.id}.desc`, { value: f?.value ?? 0 })));
    } else {
      const def = run.rt.data.skills.get(card.id) as SkillDef;
      const owner = run.rt.data.characters.get(def.owner);
      top.append(
        el('span', '', `${t(card.source === 'own' ? 'levelup.own' : 'levelup.cross')}${owner ? ` · ${t(owner.i18n)}` : ''}`),
        el('span', '', t(card.upgrade ? 'levelup.upgrade' : 'levelup.new')),
        el('span', '', t('levelup.rank', { n: card.rank })),
        el('span', '', card.rarity ? t(`rarity.${card.rarity}`) : ''),
      );
      b.append(top, el('span', 'nm', `${def.icon} ${t(`${def.i18n}.name`)}`), el('span', 'ds', t(`${def.i18n}.desc`)));
      if (card.fusion !== null) {
        const f = run.draftData?.fusions.find((x) => x.id === card.fusion);
        b.append(el('span', 'fx', f?.hidden ? t('levelup.fusionHidden') : t('levelup.fusion')));
      }
    }
    b.addEventListener('click', () => choose(card, index));
    return b;
  }

  function choose(card: Card, index: number): void {
    if (!drafting(run)) return;
    if (needsReplace(run, card)) return renderSheet(index);
    take(index);
  }

  function take(index: number, replace?: string): void {
    if (!drafting(run)) return;
    const r = pickCard(run, index, replace);
    if (!r.ok) return;
    note = r.fusions.map((f) => t('levelup.fusionFired', { name: t(`${f.i18n}.name`) })).join(' ');
    o.onPick();
    render();
  }

  function renderSheet(index: number): void {
    if (!drafting(run)) return;
    box.textContent = '';
    const sheet = el('div', 'lvup-sheet');
    sheet.append(el('p', 'lvup-note', t('levelup.replaceTitle')));
    for (const id of ownedActives(run)) {
      const def = skillDef(id);
      const b = el('button', '', `${def.icon} ${t(`${def.i18n}.name`)}`);
      b.addEventListener('click', () => take(index, id));
      sheet.appendChild(b);
    }
    const cancel = el('button', '', t('levelup.replaceCancel'));
    cancel.addEventListener('click', render);
    sheet.appendChild(cancel);
    box.appendChild(sheet);
  }

  function render(): void {
    if (!drafting(run) || run.draft.pending <= 0) {
      box.hidden = true;
      box.textContent = '';
      o.onDone();
      return;
    }
    const d = run.draft;
    const cards = currentOffer(run);
    box.hidden = false;
    box.textContent = '';
    const lv = draftLevel(run);
    const head = el('div', 'lvup-head');
    head.append(el('span', '', t('levelup.header', { from: lv - 1, to: lv })), el('span', '', t('levelup.remaining', { n: d.pending })));
    const hint = o.hint();
    const list = el('div', 'lvup-cards');
    cards.forEach((c, k) => list.appendChild(cardButton(c, k)));
    const foot = el('div', 'lvup-foot');
    const skip = el('button', 'grow', t('levelup.skip', { n: run.draftData.rules.cards.skipCash }));
    skip.addEventListener('click', () => {
      if (!skipCard(run)) return;
      note = '';
      render();
    });
    const re = el('button', '', t('levelup.reroll', { n: d.rerollsLeft }));
    re.disabled = d.rerollsLeft <= 0;
    re.addEventListener('click', () => {
      if (reroll(run)) render();
    });
    const info = el('button', 'ic48', 'ⓘ');
    info.setAttribute('aria-label', t('levelup.odds'));
    info.setAttribute('aria-expanded', String(showOdds));
    info.addEventListener('click', () => {
      showOdds = !showOdds;
      render();
    });
    foot.append(skip, re, info);
    const w = run.draftData.rules.cards.rarity.weights;
    const total = Object.values(w).reduce((s, x) => s + x, 0);
    const pct = (k: string): number => Math.round(((w[k] ?? 0) / total) * 100);
    const odds = el('p', 'lvup-odds', t('levelup.oddsText', { common: pct('common'), rare: pct('rare'), legendary: pct('legendary') }));
    odds.hidden = !showOdds;
    box.append(head, el('p', 'lvup-note', hint ?? note), list, odds, foot);
  }

  return {
    open(): void {
      note = '';
      render();
    },
  };
}
