/** Structural fixture for the collection checks; never included in lesson content. */
export function lessonFixture(id = 'bits', section = 'i1', fallback = false) {
  return [
    '---',
    'id: ' + id,
    'title: Учебный пример',
    'section: ' + section,
    'taskNumbers: [1]',
    'readingMinutes: 5',
    'prerequisites: []',
    '---',
    '<LessonHeader />',
    '',
    '<Motivation>Как измерить информацию в сообщении.</Motivation>',
    '',
    '<Theory>Объяснение темы. <Figure id="first" /> <Figure id="second" /></Theory>',
    '',
    fallback
      ? '<InteractiveFallback id="bits-and-bytes"><Figure id="static" /></InteractiveFallback>'
      : '<Interactive id="bits-and-bytes" />',
    '',
    '<Examples><Example id="one" /><Example id="two" /><Example id="three" /></Examples>',
    '',
    '<Mistakes><Mistake>Первая ошибка.</Mistake><Mistake>Вторая ошибка.</Mistake><Mistake>Третья ошибка.</Mistake></Mistakes>',
    '',
    '<Quiz><Question id="a" /><Question id="b" /><Question id="c" /><Question id="d" /><Question id="e" /></Quiz>',
    '',
    '<StreamLink />',
    '',
    '<CheatSheet>Правило вычисления объёма.</CheatSheet>',
    '',
  ].join('\n');
}

export function withoutBlock(source, block) {
  return source.replace(
    new RegExp(
      '<' +
        block +
        '(?:\\s[^>]*)?\\s*/>|<' +
        block +
        '\\b[^>]*>[\\s\\S]*?</' +
        block +
        '>',
      'u',
    ),
    '',
  );
}
