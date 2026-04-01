import { HtmlPreview } from "../artifact/HtmlPreview";
import { JsxPreview } from "./JsxPreview";

type Props = {
  content: string;
  contentType: "html" | "jsx";
  title: string;
};

export function CanvasPreview({ content, contentType, title }: Props) {
  if (contentType === "jsx") {
    return <JsxPreview code={content} title={title} />;
  }
  return <HtmlPreview content={content} title={title} />;
}
