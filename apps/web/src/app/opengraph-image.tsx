import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/ogImage";

export const alt = "Nexa Chess Academy — live online chess classes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    subtitle: "Live coaching for kids and adults, from first moves to tournament play.",
    title: "Online Chess Classes & Coaching"
  });
}
