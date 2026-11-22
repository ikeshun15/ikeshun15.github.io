/**
 * src/content/*.yaml の中身を、ページで使う形にして返す。
 * どのセクションを出すか（並び・非表示・中身が空かどうか）は、ここで一度だけ決める。
 * ページ（Profile.astro）もメニュー（Header.astro）も、この結果をそのまま使う。
 */
import { getCollection, getEntry } from 'astro:content';

const byOrder = <T extends { data: { order: number } }>(a: T, b: T) => a.data.order - b.data.order;

export async function getProfile() {
  const entry = await getEntry('profile', 'profile');
  if (!entry) throw new Error('src/content/profile.yaml が読み込めません');
  return entry.data;
}

/** 経歴。下書き（draft: true）は手元（pnpm dev）でだけ見せる */
export async function getHistory() {
  const items = (await getCollection('history')).sort(byOrder).map((e) => e.data);
  return import.meta.env.DEV ? items : items.filter((h) => !h.draft);
}

export async function getGear() {
  return (await getCollection('gear')).sort(byOrder).map((e) => e.data);
}

export type SectionId = 'about' | 'history' | 'gear';

/** ページとメニューに出すセクション（書いた順。非表示・中身が空のものは除く） */
export async function getSections() {
  const [sections, history, gear] = await Promise.all([getCollection('sections'), getHistory(), getGear()]);
  const hasContent: Record<SectionId, boolean> = { about: true, history: history.length > 0, gear: gear.length > 0 };
  return sections
    .sort(byOrder)
    .map((e) => e.data)
    .filter((s) => !s.hidden && hasContent[s.id]);
}
