import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/ogImage";

export const alt = "Nexa Chess Academy — online chess classes for kids and adults";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    subtitle: "FIDE-rated coaches · Beginner to advanced · 1-on-1, buddy & group · Sunday tournaments",
    title: "Online Chess Classes for Kids & Adults"
  });
}
