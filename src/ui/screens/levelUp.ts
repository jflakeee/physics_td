import type { Play } from '../../game/play.ts';
import { send } from '../../game/play.ts';
import type { Card } from '../../rules/cards.ts';
import { needsReplace } from '../../rules/cards.ts';
import { regional } from '../../rules/skills.ts';
import type { CharacterDef } from '../../rules/types.ts';
import type { T } from '../i18n.ts';
import { drawCardPreview } from '../widgets/cardPreview.ts';

/**
 * Level-up draft sheet (DETAILED §15.4): header Lv a ▸ b + remaining picks, 3 cards (source
 * character colour border, own/cross tag, rarity border, one-line effect, axis icon, ✨ fusion),
 * [skip · +40] [🎲 n] and the published odds. Replacement sheet when actives are full.
 * Display only — every choice is sent as a command.
 */
export interface LevelUpView { el: HTMLElement; sync(): void; }

export function createLevelUp(play: Play, t: T, chars: readonly CharacterDef[]): LevelUpView {
  const el = document.createElement('div');
  el.className = 'levelup';
  el.setAttribute('role', 'dialog');
  el.hidden = true;
  let shown: Card[] | null = null;
  const mk = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  const render = () => {
    const rs = play.rules!, ds = play.draft!, ss = play.score!, offer = ds.offer ?? [];
    el.textContent = '';
    const head = mk('header');
    head.append(mk('h2', '', t('levelUp.title', { from: ss.level - ss.pending, to: ss.level - ss.pending + 1 })), mk('span', 'remain', t('levelUp.remaining', { n: ss.pending })));
    el.append(head);
    const list = mk('div', 'cards');
    offer.forEach((c, i) => {
      const b = mk('button', 'card') as HTMLButtonElement;
      b.dataset.index = String(i);
      if (c.kind === 'skill') {
        const def = regional(rs.defs.get(c.skill)!, rs.region);
        const owner = chars.find(x => x.id === def.owner);
        b.classList.add(c.rarity, c.side);
        if (owner) b.style.setProperty('--owner', owner.color);
        const top = mk('div', 'top');
        top.append(mk('span', 'tag', t(c.side === 'own' ? 'levelUp.own' : 'levelUp.cross')), mk('span', 'rarity', t('rarity.' + c.rarity)));
        if (def.axis) top.append(mk('span', 'axis', t('axis.' + def.axis)));
        const name = mk('div', 'name', `${def.icon} ${t(def.i18n + '.name')}`);
        const line = mk('div', 'desc', t(def.i18n + '.desc'));
        const rank = mk('div', 'rank', c.upgrade ? t('levelUp.rank', { n: c.rank }) : `${t('levelUp.new')} · ${t('levelUp.rank', { n: c.rank })}`);
        const pv = document.createElement('canvas');
        pv.className = 'preview';
        pv.setAttribute('aria-hidden', 'true');
        drawCardPreview(pv, rs, def);
        const body = mk('div', 'card-body');
        body.append(top, name, line, rank);
        b.append(pv, body);
        if (c.fusion) body.append(mk('div', 'fusion', FUSION_HIDDEN(play, c.fusion) ? t('fusion.hint') : '✨ ' + t('fusion.' + camel(c.fusion) + '.name')));
        b.setAttribute('aria-label', `${t(c.side === 'own' ? 'levelUp.own' : 'levelUp.cross')} ${t(def.i18n + '.name')} ${t('rarity.' + c.rarity)}`);
      } else {
        b.classList.add('sub');
        b.append(mk('div', 'name', t('sub.' + c.sub + '.name')), mk('div', 'desc', t('sub.' + c.sub + '.desc')));
      }
      b.addEventListener('click', () => {
        if (needsReplace(rs, c)) return showReplace(i);
        send(play, { t: 'pick', index: i });
      });
      list.append(b);
    });
    el.append(list);
    const foot = mk('footer');
    const skip = mk('button', 'skip', t('levelUp.skip', { cash: rs.eco.draft.skipCash })) as HTMLButtonElement;
    skip.addEventListener('click', () => send(play, { t: 'skip' }));
    const rr = mk('button', 'reroll', t('levelUp.reroll', { n: ds.rerollsLeft })) as HTMLButtonElement;
    rr.disabled = ds.rerollsLeft <= 0;
    rr.addEventListener('click', () => send(play, { t: 'reroll' }));
    const r = rs.eco.draft.rarity;
    const odds = mk('details', 'odds');
    odds.append(mk('summary', '', 'ⓘ'), mk('p', '', t('levelUp.odds', { c: r.common, r: r.rare, l: r.legendary })));
    foot.append(skip, rr, odds);
    el.append(foot);
  };

  const showReplace = (index: number) => {
    const rs = play.rules!;
    const sheet = mk('div', 'replace');
    sheet.append(mk('p', '', t('levelUp.replace')));
    for (const o of rs.owned) {
      const d = rs.defs.get(o.id)!;
      if (!['basic', 'tactical', 'ultimate'].includes(d.slot)) continue;
      const r = regional(d, rs.region);
      const b = mk('button', '', `${r.icon} ${t(r.i18n + '.name')}`);
      b.addEventListener('click', () => send(play, { t: 'pick', index, replace: o.id }));
      sheet.append(b);
    }
    el.append(sheet);
  };

  return {
    el,
    sync() {
      const open = play.phase === 'levelup' && !!play.draft?.offer;
      el.hidden = !open;
      if (open && play.draft!.offer !== shown) { shown = play.draft!.offer; render(); }
      if (!open) shown = null;
    },
  };
}

const camel = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const FUSION_HIDDEN = (p: Play, id: string) => p.fusions.find(f => f.id === id)?.hidden ?? false;
