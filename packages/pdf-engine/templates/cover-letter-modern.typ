// packages/pdf-engine/templates/cover-letter-modern.typ
#let render-cover-letter(candidate, companyName, jobTitle, bodyParagraphs) = {
  set page(
    paper: "us-letter",
    margin: (x: 0.75in, y: 0.75in),
  )
  set text(
    font: ("Inter", "Liberation Sans", "Helvetica"),
    size: 10.2pt,
    fill: rgb("#111827"),
  )
  set par(justify: false, leading: 0.65em)

  text(size: 15pt, weight: "bold")[#candidate.fullName]
  v(2pt)
  text(size: 9.2pt, fill: rgb("#4B5563"))[#candidate.locationCity | #candidate.email]
  v(10pt)
  line(length: 100%, stroke: 0.6pt + rgb("#D1D5DB"))
  v(14pt)

  text(weight: "bold")[Re: #jobTitle — #companyName]
  v(10pt)

  for para in bodyParagraphs [
    #para
    #v(8pt)
  ]
}
