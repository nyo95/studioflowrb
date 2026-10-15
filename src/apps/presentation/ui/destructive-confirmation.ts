type ImageCounts = { annotations: readonly unknown[] };
type SlideCounts = { images: readonly ImageCounts[] };
const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;

export function imageConfirmation(image: ImageCounts, replace: boolean) {
  return { title: replace ? "Replace this image?" : "Remove this image?", description: `Its ${count(image.annotations.length, "pin")} will be deleted.`, confirmLabel: replace ? "Replace image" : "Remove from slide" };
}
export function slideConfirmation(slide: SlideCounts) {
  return { title: "Delete this slide?", description: `Its ${count(slide.images.length, "image")} and ${count(slide.images.reduce((sum, image) => sum + image.annotations.length, 0), "pin")} will be deleted.`, confirmLabel: "Delete slide" };
}
export function boardConfirmation(slides: readonly SlideCounts[]) {
  return { title: "Delete this board?", description: `Its ${count(slides.length, "slide")} will be deleted.`, confirmLabel: "Delete board" };
}
export function pinConfirmation(number: number) {
  return { title: `Delete pin ${number}?`, description: "This cannot be undone.", confirmLabel: "Delete pin" };
}
