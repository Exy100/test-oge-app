import { renderRichText } from '../core/rich-text/render';
import RichTextView from './RichTextView';

export default function RichText({ source }: { source: string }) {
  return <RichTextView html={renderRichText(source)} />;
}
