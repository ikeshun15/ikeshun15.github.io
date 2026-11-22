/**
 * サイトの中身（src/content/*.yaml）の読み込み方と、書き方のきまり。
 * きまりに合わない書き方をすると、ビルドのときにどのファイルのどこが違うかを教えてくれる。
 */
import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { parse } from 'yaml';

/**
 * YAML を読む。数字のように見える値（2022.04 など）が数に化けないよう、値はすべて文字として読む。
 * リストは上から順に order をつける（id は書かなくてよい）
 */
const yamlList = (path: string) =>
  file(path, {
    parser: (text) => {
      const data: unknown = parse(text, { schema: 'failsafe' }) ?? [];
      if (!Array.isArray(data)) throw new Error(`${path} は「- 」で始まるリストで書いてください`);
      // id は「上から何番目か」（書き間違えたとき、エラーに「gear → 2」のように出る）
      return data.map((item: Record<string, unknown>, i) => ({ id: String(item.id ?? i + 1), ...item, order: i }));
    },
  });
const yamlObject = (path: string, id: string) =>
  file(path, { parser: (text) => [{ id, ...(parse(text, { schema: 'failsafe' }) as Record<string, unknown>) }] });

const l10n = z.object({ ja: z.string(), en: z.string() });
const flag = z.stringbool().default(false);

export const collections = {
  sections: defineCollection({
    loader: yamlList('src/content/sections.yaml'),
    schema: z.object({
      id: z.enum(['about', 'history', 'gear']),
      order: z.number(),
      title: z.string(),
      sub: z.string().optional(),
      doodle: z.enum(['camera', 'path', 'lens']).optional(),
      lead: l10n.optional(),
      hidden: flag,
    }),
  }),
  profile: defineCollection({
    loader: yamlObject('src/content/profile.yaml', 'profile'),
    schema: z.object({
      catch: l10n.optional(),
      name: z.string(),
      bio: z.object({ ja: z.array(z.string()), en: z.array(z.string()) }),
      facts: z.array(z.object({ label: l10n, value: l10n, href: z.string().optional() })).default([]),
      links: z.array(z.object({ label: z.string(), icon: z.enum(['x', 'instagram', 'github', 'facebook']), href: z.url() })),
    }),
  }),
  history: defineCollection({
    loader: yamlList('src/content/history.yaml'),
    schema: z.object({
      order: z.number(),
      period: z.string(),
      title: l10n,
      note: l10n.optional(),
      tags: z.array(z.string()).default([]),
      draft: flag,
    }),
  }),
  gear: defineCollection({
    loader: yamlList('src/content/gear.yaml'),
    schema: z.object({
      order: z.number(),
      category: l10n,
      name: z.string(),
      model: z.string().optional(),
      href: z.url().optional(),
      sponsored: flag,
    }),
  }),
};
