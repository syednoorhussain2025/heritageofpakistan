import HeritageSection from "./HeritageSection";

export default function HeritagePhotoRights() {
  return (
    <HeritageSection
      id="photography"
      title="Photography & Content"
      iconName="photography-content"
    >
      <div
        className="text-[13px]"
        style={{ color: "var(--muted-foreground, #5b6b84)" }}
      >
        Unless noted otherwise, photographs and written content are © Heritage
        of Pakistan. Please contact us for permissions and usage rights.
      </div>
    </HeritageSection>
  );
}
