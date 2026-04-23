export default function LegalMdxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12 md:px-6">
      <article
        className="
          text-muted-foreground leading-7
          [&_h1]:text-foreground [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight
          [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-medium
          [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-medium
          [&_p]:text-sm [&_p]:leading-relaxed
          [&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1
          [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1
          [&_li]:text-sm
          [&_hr]:border-border [&_hr]:my-8
          [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline
        "
      >
        {children}
      </article>
    </section>
  );
}
