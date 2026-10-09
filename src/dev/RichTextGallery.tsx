import { useState } from 'react';
import RichText from '../components/RichText';
export default function RichTextGallery() {
  const [source, setSource] = useState(
    '**Биты и байты**\n\n$8 \\times 8 = 64$\n\n```python\nprint(8 * 8)\n```\n\n| Единица | Биты |\n| --- | --- |\n| Байт | 8 |',
  );
  return (
    <section id="client-rich-text">
      <label htmlFor="rich-source">Содержимое</label>
      <textarea
        id="rich-source"
        value={source}
        onChange={(event) => {
          setSource(event.target.value);
        }}
        rows={8}
      />
      <RichText source={source} />
    </section>
  );
}
