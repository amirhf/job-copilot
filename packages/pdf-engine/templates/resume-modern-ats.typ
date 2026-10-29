// packages/pdf-engine/templates/resume-modern-ats.typ
#let render-resume(data, density: "standard") = {
  let margin-y = if density == "compact" { 0.42in } else if density == "comfortable" { 0.6in } else { 0.5in }
  let margin-x = if density == "compact" { 0.48in } else { 0.55in }
  let body-size = if density == "compact" { 9.2pt } else { 9.6pt }
  let block-spacing = if density == "compact" { 5pt } else { 7pt }

  set page(
    paper: "us-letter",
    margin: (x: margin-x, y: margin-y),
  )
  set text(
    font: ("Inter", "Liberation Sans", "Helvetica"),
    size: body-size,
    fill: rgb("#111827"),
  )
  set par(justify: false, leading: 0.52em)

  align(center)[
    #text(size: 16pt, weight: "bold")[#data.candidate.fullName] \
    #v(2pt)
    #text(size: 10pt, weight: "medium", fill: rgb("#374151"))[#data.targetHeadline] \
    #v(2pt)
    #text(size: 8.8pt, fill: rgb("#4B5563"))[
      #data.candidate.locationCity | #data.candidate.email
    ]
  ]

  v(block-spacing)
  line(length: 100%, stroke: 0.6pt + rgb("#D1D5DB"))
}
