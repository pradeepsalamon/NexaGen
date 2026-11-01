import {
  escapeMarkdown,
  markdownToPlainText,
  markdownToWhatsApp,
  parseInline,
  renderFormattedTemplate,
  splitTextLinks
} from "@nexa-chess/types";
import { messageToEmailHtml } from "./message-html";

describe("message formatting", () => {
  describe("messageToEmailHtml", () => {
    it("formats, keeping single line breaks", () => {
      const html = messageToEmailHtml("**Hi** _there_\nline two\n\n- one\n- two");
      expect(html).toContain("<strong>Hi</strong> <em>there</em><br>line two");
      expect(html).toContain("<li>one</li><li>two</li>");
    });

    it("escapes HTML everywhere, including a link's label and address", () => {
      const html = messageToEmailHtml('<script>x</script> [<b>y</b>](https://a.test/?q="1"&r=2)');
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<b>");
      expect(html).toContain('href="https://a.test/?q=&quot;1&quot;&amp;r=2"');
    });

    it("never links an unsafe address, or a path an email can't resolve", () => {
      const html = messageToEmailHtml("[bad](javascript:alert(1)) [page](/student/schedule)");
      expect(html).not.toContain("<a ");
      expect(html).toContain("page");
    });

    it("makes every link visibly a link", () => {
      expect(messageToEmailHtml("See https://a.test")).toContain("text-decoration:underline");
    });
  });

  describe("parseInline links", () => {
    it("links a bare address without taking sentence punctuation", () => {
      expect(parseInline("See https://a.test/b.")).toEqual([
        { text: "See ", type: "text" },
        { children: [{ text: "https://a.test/b", type: "text" }], href: "https://a.test/b", type: "link" },
        { text: ".", type: "text" }
      ]);
    });

    it("doesn't read underscores in an address as italics", () => {
      const [link] = parseInline("https://a.test/_x_/y_z");
      expect(link).toMatchObject({ href: "https://a.test/_x_/y_z", type: "link" });
    });

    it("never nests a link inside a link", () => {
      const [link] = parseInline("[https://a.test](https://a.test)");
      expect(link).toMatchObject({ children: [{ text: "https://a.test", type: "text" }], type: "link" });
    });

    it("leaves a scheme with no address as text", () => {
      expect(parseInline("https://")).toEqual([{ text: "https://", type: "text" }]);
    });
  });

  describe("renderFormattedTemplate", () => {
    const render = (template: string, value: string) => renderFormattedTemplate(template, { v: value });

    it("keeps the template's formatting and drops a value's", () => {
      const source = render("**Hi** {{v}}", "[Pay](https://evil.test) **now** _x_");
      expect(messageToEmailHtml(source)).toContain("<strong>Hi</strong>");
      expect(messageToEmailHtml(source)).not.toContain(">Pay</a>");
      expect(markdownToPlainText(source)).toBe("Hi [Pay](https://evil.test) **now** _x_");
    });

    it("can't start a block from a value", () => {
      for (const value of ["# Big", "> quote", "- item", "1. item", "```\ncode"]) {
        expect(markdownToPlainText(render("{{v}}", value))).toBe(value);
      }
    });

    it("keeps an address's characters when it's linked or used as a link's target", () => {
      const url = "https://a.test/reset?token=a_b*c[d]_e";
      expect(markdownToPlainText(render("{{v}}", url))).toContain("https://a.test/reset?token=a_b*c");
      expect(messageToEmailHtml(render("[Open]({{v}})", url))).toContain(`href="${url}"`);
    });

    it("keeps an announcement's own formatting", () => {
      const source = renderFormattedTemplate("{{announcement.body}}", { "announcement.body": "**Holiday**" });
      expect(messageToEmailHtml(source)).toContain("<strong>Holiday</strong>");
    });

    it("round-trips through escapeMarkdown", () => {
      const value = "a\\b *c* _d_ `e` [f] 1. g - h # i";
      expect(markdownToPlainText(escapeMarkdown(value))).toBe(value);
    });
  });

  describe("markdownToWhatsApp", () => {
    it("uses WhatsApp's own markers and writes a link out", () => {
      expect(markdownToWhatsApp("## Title\n\n**a** _b_ [Join](https://a.test)")).toBe(
        "*Title*\n\n*a* _b_ Join: https://a.test"
      );
    });

    it("leaves plain text alone", () => {
      const text = "Hi Asha,\nyour class is at 6:00 pm.\n\nhttps://a.test/x_y";
      expect(markdownToWhatsApp(text)).toBe(text);
    });

    it("shows only the label for a link that can't be followed", () => {
      expect(markdownToWhatsApp("[page](/student/schedule)")).toBe("page");
    });
  });

  describe("splitTextLinks", () => {
    it("splits out addresses and changes nothing else", () => {
      expect(splitTextLinks("**see** https://a.test/b, ok")).toEqual([
        { text: "**see** " },
        { href: "https://a.test/b", text: "https://a.test/b" },
        { text: ", ok" }
      ]);
    });

    it("ignores other schemes", () => {
      expect(splitTextLinks("javascript:alert(1) ftp://a.test")).toEqual([
        { text: "javascript:alert(1) ftp://a.test" }
      ]);
    });
  });
});
