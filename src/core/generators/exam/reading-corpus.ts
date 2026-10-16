import { makeHtm, readHtm, type HtmBlock } from '../../datasets/htm.ts';
import { Rng } from '../../rng.ts';
import type { SourceFile } from '../../datasets/index.ts';

export const authors = [
  'Нина Речная',
  'Олег Ветров',
  'Ирина Полевая',
  'Павел Листьев',
  'Алла Северина',
  'Глеб Озёрный',
] as const;
const heroes = ['Мирон', 'Лев', 'Артём', 'Денис', 'Вадим', 'Тимур', 'Егор'];
const petNames = [
  'Буран',
  'Ветерок',
  'Дымок',
  'Уголёк',
  'Бим',
  'Дружок',
  'Туман',
  'Шустрик',
];
const helpers = [
  'Мельников',
  'Кузнецов',
  'Орлов',
  'Лебедев',
  'Серов',
  'Волков',
  'Ильин',
  'Зайцев',
];
const roles = [
  'почтальон',
  'смотритель',
  'картограф',
  'библиотекарь',
  'лодочник',
  'фотограф',
  'учитель',
  'мастер',
];
const adjectives = [
  'напрасный',
  'нелёгкий',
  'полезный',
  'упорный',
  'кропотливый',
  'ответственный',
  'увлекательный',
  'необычный',
];
export const episodes = [
  'разыскал недостающий лист карты',
  'починил полевой компас',
  'проверил показания берегового флюгера',
  'получил посылку с образцами',
  'выступил перед кружком молодых исследователей',
  'вернул архивный альбом смотрителю',
  'услышал первую репетицию оркестра',
  'помог нанести остров на карту',
] as const;
const cities = [
  'Берёзовск',
  'Ключевск',
  'Речноград',
  'Сосновск',
  'Озёрск',
  'Маяковск',
  'Зареченск',
  'Ветроводск',
  'Дубровск',
  'Ясногорск',
  'Тихореченск',
  'Луговск',
];
export interface ReadingQuery {
  author: string;
  hero: string;
  episode: string;
  mode: 'nickname' | 'character' | 'role';
}
export interface ReadingEvidence {
  path: string;
  city: string;
  paragraphs: readonly string[];
  distance: number;
  answer: string;
}
interface Chapter {
  city: string;
  episode: string;
  distance: number;
  helper: string;
  role: string;
  adjective: string;
  petName: string;
}
interface Story {
  author: string;
  hero: string;
  path: string;
  chapters: readonly Chapter[];
  bytes: Uint8Array;
}

function story(index: number): Story {
  const rng = new Rng(`original-reading-corpus-v2:${String(index)}`),
    author = authors[index % authors.length] ?? '',
    hero = heroes[Math.floor(index / authors.length)] ?? '',
    title = `${['Тихая', 'Северная', 'Дальняя', 'Новая', 'Летняя', 'Речная', 'Озёрная'][Math.floor(index / authors.length)] ?? ''} ${['пристань', 'тропа', 'записка', 'карта', 'переправа', 'встреча'][index % authors.length] ?? ''}`,
    path = `Тексты/${author}/${title}.htm`,
    route = rng.shuffle(cities).slice(0, 8),
    order = rng.shuffle([...episodes]),
    chapters: Chapter[] = [],
    blocks: HtmBlock[] = [
      { tag: 'h1', text: title },
      { tag: 'p', text: `Автор: ${author}.` },
      {
        tag: 'p',
        text: `${hero} отправился в путешествие по речным городам. Он обещал школьному музею привезти путевой дневник, рисунки берегов и точные копии старых карт. Раньше он видел эти места только на фотографиях и поэтому решил не торопиться с выводами.`,
      },
    ];
  for (let i = 0; i < 8; i++) {
    const city = route[i] ?? '',
      episode = order[i] ?? '',
      distance = rng.int(1, 3),
      helper = helpers[i] ?? '',
      role = rng.pick(roles),
      adjective = rng.pick(adjectives),
      petName = rng.pick(petNames),
      day = i + 3,
      bearing = rng.int(1, 35) * 10,
      temperature = rng.int(11, 23),
      level = rng.int(110, 180);
    chapters.push({
      city,
      episode,
      distance,
      helper,
      role,
      adjective,
      petName,
    });
    blocks.push(
      { tag: 'h2', text: `Запись ${String(i + 1)}. Дорога и встреча` },
      {
        tag: 'p',
        text: `Пунктом прибытия на билете был указан город ${city}. Местный ${role} ${helper} встретил гостя на причале. Щенка, бегавшего рядом, звали ${petName}. ${hero} сверил время с башенными часами и нашёл на плане дорогу к небольшому гостевому дому. Впереди был целый день, который он собирался провести пешком.`,
      },
    );
    const paragraphs = rng
      .shuffle([
        `Утро ${String(day)} августа началось с прохладного ветра. В дневнике появилась запись: воздух ${String(temperature)} градусов, вода у мерной рейки ${String(level)} сантиметров. Рядом путешественник нарисовал рейку, чтобы позже не спутать её деления с отметками на другом берегу.`,
        `Смотритель показал старый план набережной. Север на нём был обозначен стрелкой, а дорога к пристани поворачивала на восток. ${hero} переписал условные знаки и отметил направление ${String(bearing)} градусов, но оставил место для проверки: старый план мог отличаться от новой застройки.`,
        `После завтрака ребята из местного кружка вынесли к реке складной стол. На нём разложили фотографии прежней переправы и прозрачную кальку. Каждый сначала отмечал знакомые ориентиры самостоятельно, затем участники сравнивали рисунки и объясняли, почему выбрали именно эти точки.`,
        `В библиотеке нашлась папка с письмами прежнего смотрителя. Бумага пожелтела по краям, однако даты читались хорошо. ${hero} выписал только сведения о дороге и подписал источник каждой записи. Рассказ проводника он сохранил отдельно: устное воспоминание ещё предстояло сопоставить с документами.`,
        `К полудню облака закрыли солнце. На воде стало труднее различать отражение моста и сами опоры, поэтому наблюдения перенесли на берег. Путешественник не стал исправлять утренний рисунок по памяти: он открыл чистый лист и подписал время нового наблюдения.`,
        `В мастерской пахло деревом и краской. На полке стояли модели лодок, сделанные школьниками разных лет. Хозяин объяснил устройство плоского дна и показал, как меняется осадка при переносе груза. ${hero} зарисовал две модели рядом и отметил, какие детали он действительно видел.`,
        `Участники прошли по тропе до поворота реки. На каждом участке они считали шаги дважды: туда и обратно. Получившиеся расстояния немного различались, и в дневнике оставили оба результата. Вечером решили обсудить, как длина шага зависит от уклона и тяжести рюкзака.`,
        `Перед возвращением в гостевой дом ${hero} зашёл на почту. Он отправил в школьный музей короткое письмо без окончательных выводов. В конверте лежала копия одной страницы дневника; оригинал остался в папке, где листы были пронумерованы и защищены от дождя.`,
      ])
      .slice(0, 2);
    paragraphs.splice(
      distance - 1,
      0,
      `${hero} ${episode}. «Это ${adjective} труд», — сказал ${helper}. Путешественник подробно описал событие в дневнике и отметил, кто помог ему разобраться с работой. Вечером запись прочитали товарищам, чтобы проверить, не потерялась ли важная подробность.`,
    );
    blocks.push(...paragraphs.map((text): HtmBlock => ({ tag: 'p', text })), {
      tag: 'p',
      text: `На следующий день путешествие продолжилось. Перед отъездом ${hero} сверил список вещей и убрал дневник в водонепроницаемый чехол. Новую запись он решил начать уже на следующей остановке, чтобы не смешивать события разных городов.`,
    });
  }
  return { author, hero, path, chapters, bytes: makeHtm({ title, blocks }) };
}
// One fixed authored corpus, not an unbounded cache keyed by user seeds.
let corpus: readonly Story[] | undefined;
function stories(): readonly Story[] {
  return (corpus ??= Array.from({ length: 41 }, (_, i) => story(i)));
}
export function readingConstruction(seed: string): {
  query: ReadingQuery;
  answer: string;
  distance: number;
  adjective: string;
} {
  const rng = new Rng('context-reading:' + seed),
    selected = rng.pick(stories()),
    chapter = rng.pick(selected.chapters),
    mode = rng.pick(['nickname', 'character', 'role'] as const);
  return {
    query: {
      author: selected.author,
      hero: selected.hero,
      episode: chapter.episode,
      mode,
    },
    answer:
      chapter[
        mode === 'character'
          ? 'helper'
          : mode === 'nickname'
            ? 'petName'
            : 'role'
      ],
    distance: chapter.distance,
    adjective: chapter.adjective,
  };
}
export function readingSources(author?: string): SourceFile[] {
  return [
    ...stories()
      .filter((item) => author === undefined || item.author === author)
      .map(({ path, bytes }) => ({
        path,
        bytes: bytes.slice(),
        format: 'htm' as const,
        license: 'CC0-1.0',
      })),
    {
      path: 'README.txt',
      format: 'txt',
      license: 'CC0-1.0',
      bytes: new TextEncoder().encode(
        'Авторский корпус: 41 рассказ. Все авторы, герои и события вымышлены. Лицензия CC0-1.0.\nРаспакуй ZIP. HTM открываются в браузере без подключения к сети; кодировка UTF-8. Ищи по автору, герою и эпизоду, затем прочитай окружающий текст.\n',
      ),
    },
  ];
}
/** Find the event in actual document paragraphs and recover its arrival context. */
export function findReadingEvidence(
  files: ReadonlyMap<string, Uint8Array>,
  query: ReadingQuery,
): ReadingEvidence[] {
  const found: ReadingEvidence[] = [];
  for (const [path, bytes] of files) {
    if (!path.startsWith(`Тексты/${query.author}/`) || !path.endsWith('.htm'))
      continue;
    const document = readHtm(bytes);
    if (!document.blocks.some(({ text }) => text === `Автор: ${query.author}.`))
      continue;
    let chapter: string[] = [];
    for (const block of document.blocks) {
      if (block.tag === 'h2') chapter = [];
      else if (block.tag === 'p') {
        chapter.push(block.text);
        if (block.text.startsWith(`${query.hero} ${query.episode}.`)) {
          const city =
            /^Пунктом прибытия на билете был указан город ([А-ЯЁа-яё]+)\./u.exec(
              chapter[0] ?? '',
            )?.[1];
          const person = /Местный ([а-яё]+) ([А-ЯЁа-яё]+) встретил гостя/u.exec(
              chapter[0] ?? '',
            ),
            quote = /«Это ([а-яё]+) труд», — сказал ([А-ЯЁа-яё]+)\./u.exec(
              block.text,
            ),
            answer =
              query.mode === 'nickname'
                ? /Щенка, бегавшего рядом, звали ([А-ЯЁа-яё]+)\./u.exec(
                    chapter[0] ?? '',
                  )?.[1]
                : query.mode === 'character'
                  ? quote?.[2]
                  : person?.[1];
          if (city && person && quote && person[2] === quote[2] && answer)
            found.push({
              path,
              city,
              paragraphs: [...chapter],
              distance: chapter.length - 1,
              answer,
            });
        }
      }
    }
  }
  return found;
}
