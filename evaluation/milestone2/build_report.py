# /// script
# requires-python = ">=3.12"
# dependencies = ["python-docx==1.2.0", "reportlab==4.4.4", "pillow>=12,<13"]
# ///
"""Build Deep's eight-page group draft using the supplied Milestone 2 template.

uv run evaluation/milestone2/build_report.py
The DOCX and PDF share one content source. Screenshots are rendered separately
from actual results by render_evidence.py. Missing group evidence stays explicit.
"""
from pathlib import Path
import json
from xml.sax.saxutils import escape

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/milestone2'
RESULTS=ROOT/'evaluation/milestone2/results'
REPO='https://github.com/Christopher4113/Auditor'


def content(result):
    commit=result['sourceCommit']
    rows=[]
    short={'unscoped-tfidf':'Unscoped TF-IDF','scoped-tfidf':'Scoped TF-IDF','auditor-local':'Auditor local'}
    for r in result['summary']:
        rows.append(['Policy' if r['dataset'].startswith('policy') else 'Contract',short[r['method']],
            '9/9','9/9',f"{round(r['abstention']*3)}/3",f"{round(r['taskSuccess']*12)}/12",str(r['scopeViolations']),f"{r['medianLatencyMs']:.3f}"])
    p=lambda text:('p',text)
    h=lambda text:('h',text)
    t=lambda headers,rows:('table',headers,rows)
    return [
      [
        ('title','Auditor — Capstone Milestone 2'),
        p('Group report draft prepared by Deep Nayak • November 1, 2026 • Due November 8, 2026'),
        p('DRAFT: Deep’s evidence and writing are prepared. Stakeholder meeting details, the group Milestone 1/proposal comparison, and full-system comparative evaluation must be supplied before the group submits one report.'),
        h('Basic Information'),
        t(['Student','Email / status'],[['Deep Nayak','deepnayak200@gmail.com — confirm course email'],['Christopher Lam','Team to confirm email'],['Prem Mahendra Pagare','Team to confirm email'],['Aarya Bhutkar','Team to confirm email']]),
        p('Project: Auditor, a controlled agentic accounting-close prototype for one synthetic event-management entity. Stakeholder name: [TEAM INPUT]. Meeting date and participants: [TEAM INPUT].'),
        h('Section 1  Stakeholder Follow Up and Final Deliverables'),
        p('No stakeholder meeting record was available in the provided materials. The assignment requires an actual review; repository implementation and demo fixtures do not establish that it occurred. The group must add the date, participants, presented behaviors/results, and brief notes or an appendix.'),
        t(['Feedback','Team response','Next action'],[
          ['[Actual stakeholder feedback]','[Actual response or reason for retaining design]','[Owner and agreed next action]'],
          ['[Needs still unmet]','[Effect on scope / success criteria]','[Stakeholder-confirmed deliverable]']]),
        p('Proposed deliverables for confirmation: a runnable repository, source-linked proposals with independent controls and controller review, synthetic evaluation data plus baseline comparisons, an actual close demonstration, and a final report/presentation. These are proposed rather than stakeholder-approved. Confirm task coverage, acceptable false alerts, correction accuracy, review burden, and the demonstration’s completion criteria.'),
      ],
      [
        h('Section 2  Implemented Agentic System'),
        p('Inputs are bank movements, imported journal entries, contracts, policy clauses, and vendor records scoped by entity and accounting period. The durable Convex workflow fetches unmatched bank rows, reconciles against books, investigates breaks, reviews proposals, and posts eligible entries. The React interface exposes records and controller decisions. Amounts are integer USD cents; all financial data are fictitious.'),
        ('image','architecture.png',6.95,3.1,'Figure 1. Updated workflow from source inspection. Solid boxes exist in code; green marks the retrieval slice executed for this report. Dashed orange identifies remaining work, not a deployed capability.'),
        t(['Mechanism','When used; state read or changed; effect'],[
          ['Deterministic reconciliation','Exact bank cash amount, counterparty, ±3 days against imported books. Matches update status and audit; unmatched rows become breaks for investigation.'],
          ['One accountant agent','Reads break/transaction and retrieved context; chooses typed search, ledger/contract inspection, proposal, or approval request. Proposal/citations become durable records.'],
          ['Independent controls','Checks balance, citation provenance, P&L threshold, bank hold, period lock, correction history, precedent scope and revision cap. Routes to posting, return or human review.'],
          ['Controller','Reviews escalations and gives approval/rejection instructions; signs the period. Decisions and corrections become searchable memory after runtime publication.']]),
        p('This is one LLM role coordinated with deterministic services and a human. “Three seats” does not mean three LLM agents. A retrieval-only run does not demonstrate that the entire workflow completed.'),
      ],
      [
        h('Section 2  Implementation Details and Evidence Boundary'),
        p('The active proposal action in convex/agent.ts calls the Vercel AI SDK generateText with Anthropic, default model claude-sonnet-4-5, temperature 0, and a 12-step stop condition. ANTHROPIC_MODEL can override the model. The Convex Agent component is mounted in configuration, but the active proposal path uses generateText; persistent agent-thread execution is not established by that registration.'),
        p('FastAPI provides /query, /resolve, indexing, readiness and statistics. Moss is the external retrieval provider; SQLite stores canonical chunks and a reset journal. The explicit local backend uses BM25-style lexical ranking. Policy/contracts bootstrap via an allowlist; answerKey, planted flags and expected journal entries are excluded. Runtime decisions, corrections and audit events have separate collections. Entity/effective-date filtering precedes ranking; exact canonical text supports citation checks.'),
        p('Recovery includes bounded retries for idempotent retrieval writes, readiness failures during incomplete snapshot replacement, replay of pending resets on startup, and workflow proposal revisions. CRS sandbox errors fail closed and do not release a payment hold. Posting is guarded server-side against the agent identity and self-approval. These mechanisms are inspected in source and exercised by tests; no new hosted close or live CRS/Moss result is claimed here.'),
        p('Changes since Milestone 1 cannot be verified because the group’s Milestone 1 report and selected stakeholder proposal were not supplied. Repository history shows progression from a clean generator/fake-agent gate to six scenario families, real retrieval adapters, scoring, holds and controller UI. The group must compare those changes against its actual Milestone 1 commitments. Deep’s available individual course-policy-assistant proposal describes a different project and is not treated as Auditor’s group baseline.'),
        h('Section 3  Preliminary Evaluation: Setup'),
        t(['Dataset','Source, task and evaluated size'],[
          ['Policy pilot v1','12 hand-written source-ID questions over 12 synthetic policy clauses: 9 answerable, 3 negative. Tests policy evidence retrieval, entity/date bounds and unsupported requests.'],
          ['Contract pilot v1','12 hand-written source-ID questions over 9 clauses in 6 synthetic contracts: 9 answerable, 3 negative. Tests vendor lookup, amendment timing and unsupported requests.']]),
        p('The pilots share one 21-document project corpus and are not independent public benchmarks. Labels were fixed before successful ranking runs, with one invalid source ID corrected during preflight validation. No train/test split, independent annotator or held-out-generalization claim is made. No ranker was changed or tuned on these results.'),
      ],
      [
        h('Section 3  Measured Results and Analysis'),
        p('Baseline 1 is cosine TF-IDF over clause text, title and ID, filtered by collection but ignoring entity/date. Baseline 2 applies entity/effective-date filtering to the same TF-IDF method. Auditor local uses the existing FastAPI /query, SQLite catalog, scoped local BM25-style backend, and contract-title narrowing. The proposed full agentic system is not counted as a baseline.'),
        p('All three methods receive identical examples and corpus, return up to three positive-score hits, and run once per example in fixed order: 24 questions × 3 methods = 72 executions. No LLM, cloud provider, human scoring, controller action or payment is involved. Latency excludes startup/indexing/network/model calls; only Auditor includes in-process HTTP routing. Timing is descriptive and cannot establish a fair speed ranking.'),
        t(['Data','Method','Top-1','Hit@3','Abstain','Success','Scope*','ms†'],rows),
        p('Top-1 and Hit@3 use the 9 answerable questions per dataset. Abstain uses the 3 negatives and requires a successful empty response. Success uses all 12: a valid expected first source, or correct abstention. *Scope counts returned hits violating entity/date, not questions. †Median wall time. All 72 executions completed without errors; returned texts matched canonical sources.'),
        p('Auditor local succeeds on 11/12 policy and 10/12 contract questions. It ties scoped TF-IDF on these task metrics. Scoping removes the unscoped baseline’s temporal/entity leakage, while the mostly source-worded positives leave little room to differentiate rankers. This is evidence for the scope boundary, not an LLM reasoning or semantic-retrieval advantage.'),
        p('Auditor returns irrelevant sources for P12, C10 and C12 rather than abstaining. It excludes the future amendment in C10 correctly but still returns other clauses. The current positive-score cutoff does not establish answerability. Scores are not calibrated confidence.'),
        p('Required full-system table remains pending: run Auditor and two actual task baselines on the same examples in at least two accounting datasets. Suggested comparisons are the existing matcher-only path and a fixed single-pass proposer with the same model, tools, controls and human-review rules. Use the current 11-case synthetic scenario set plus an independently labeled held-out set. Record case detection, exact posted correction, hold/escalation correctness, tool errors, model usage and close latency. The retrieval table alone does not fulfill that whole-system requirement.'),
      ],
      [
        h('Section 4  Actual Demonstration: Retrieval Slice'),
        p('Task: locate the authoritative Apex contract passage when investigating a synthetic $16,000 deposit returned as $13,600. The source data imply a $2,400 shortfall; the retrieval demonstration’s expected output is the exact contract passage, not an approved journal entry.'),
        p('Execution: the evaluator generates the current seed, indexes only its 21 policy/contract clauses into a fresh temporary catalog through POST /index/batch, and invokes the real POST /query handler. C04 supplies collection=contracts, text=Apex Staging, entity=eo-festival-nyc, asOf=2026-09-30 and k=3. Entity/date filtering and the vendor-title path select the relevant contract. The returned top source is apex-9.4 with its original deposit and inspection-fee text.'),
        ('image','case_trace.png',6.95,3.3,'Figure 2. Browser capture of the actual C04 request and response saved in results.json. This is executed local retrieval, with no model call or simulated posting. The score is a relevance score.'),
        p('The policy pilot separately retrieves policy-5.1 for non-recoverable deductions. Together these outputs supply evidence the accountant agent could use in its subsequent proposal. The screenshot corresponds to the retrieval box in Figure 1. Persisted canonical source text enables later exact citation resolution; storing evidence is distinct from approving an accounting treatment.'),
        p('Observed final output: the required source passage is retrieved correctly for this slice. No actual controller decision, D-0417 precedent, ledger posting or period sign-off was created by this experiment. Before submission the group must add an integrated current-system trace and readable screenshots showing proposal → controls → posting/escalation and the actual final outcome.'),
        p('Historical context only: retrieval/VULTR.md records an October 24 sample close with 3 breaks, 3 escalations and 0 posts, despite correct Apex proposed lines. That dated handoff is not rerun evidence or proof that the latest branch still has the same failure.'),
      ],
      [
        h('Section 5  Failure Analysis and Current Limitations'),
        t(['Observed case and evidence','Diagnosis; proposed fix and check'],[
          ['P12: “cryptocurrency tax policy” returns policy-8.1, policy-1.0 and policy-9.0. No expected source exists.','Observed retrieval false acceptance. Generic word overlap is sufficient for positive scores. Develop an answerability/abstention rule on a separate development set; validate false accepts and retained positive recall on held-out questions.'],
          ['C10: asks about the August amendment as of July. Returns northern-lines-3.1, soundwave-2.1 and brightwater-3.1; excludes the amendment.','Temporal isolation works; semantic abstention fails. Metadata-safe hits are not necessarily relevant answers. Test whether retrieved text answers the requested fact, with dated negative controls.'],
          ['C12: “catering cryptocurrency insurance” returns field-flame-5.1.','Observed topical overlap without the requested provision. Add unsupported-topic and mixed-topic negatives; compare reranking or explicit evidence sufficiency. Do not infer a generative hallucination from this retrieval-only run.']]),
        p('The evidence is preserved per query in evaluation/milestone2/results/results.json. The mechanism explanation is supported by the current lexical backend’s score>0 rule; the experiments do not isolate every causal contribution. No fix was applied to production ranking, so these remain current observed limitations.'),
        p('A separate integration risk concerns task coverage. The dataset contains 368 bank rows, 387 imported entries, 10 raw source documents and 11 cases in six families. The tested bank matcher leaves five cash mismatches, but duplicate payables, amendment accounting, bank changes and accruals require document/book/event paths as well. A fresh full close must demonstrate coverage of every labeled case; bank-match percentage is not accounting-case recall.'),
        p('The financial answer key assumes an 82-day inclusive sponsorship campaign and a $15,121.95 cumulative August correction, differing from the brief’s approximate amount. Controller/stakeholder review remains necessary before interpreting agent disagreement as error. Expected corrections and oracle scorer fixtures validate the dataset/scorer, not agent performance.'),
        p('Broader limits: one synthetic USD entity, a tiny unblinded retrieval pilot with mostly lexical positives, no public benchmark or current full-agent comparative run, and external-service/configuration dependencies. Tokens estimated from characters are not measured model billing. Estimated time/exposure reductions are not realized savings. App seat checks do not by themselves establish production user authentication; no production security assessment is claimed.'),
      ],
      [
        h('Section 6  Remaining Work Before Final Submission'),
        p('Owners below are proposed from repository responsibilities and need team agreement. Required items take priority over optional extensions; a week-by-week schedule is not assumed.'),
        t(['Priority / gap','Planned work and proposed owner','Completion evidence'],[
          ['Required: stakeholder review','Whole group; stakeholder liaison to be named. Present current behavior, measured results, failures and deliverable scope.','Actual dated notes, Feedback → Response → Next action, and agreed functionality/success criteria.'],
          ['Required: Milestone 1 continuity','Christopher + whole group. Supply group Milestone 1 and selected proposal; reconcile scope, architecture and evaluation changes.','Explicit before/after comparison and justified scope decisions.'],
          ['Required: accounting labels','Deep + controller. Review sponsorship proration, case annotations, dependencies and unsupported-query labels.','Reviewed expected outcomes; label corrections versioned before final tests.'],
          ['Required: complete source coverage','Prem + Christopher. Verify document/event handling alongside bank-trigger workflow; address all missing paths.','Actual full-close trace links all 11 cases to raw evidence; no labels supplied to the agent.'],
          ['Required: full-system comparison','Deep builds harness/data; Prem/Christopher run agent/baselines; group reviews labels.','Two baselines and Auditor on the same two accounting datasets, per-case outputs and actual result table.'],
          ['Required: real memory and review','Christopher + Prem; Aarya captures UI. Run July review, publish actual decisions/corrections, then September transfer.','Actual decision IDs, source citations, posting/hold outcomes, revision history and human sign-off.'],
          ['Required: finish evaluation limits','Deep + group. Add held-out paraphrases/negatives, independent labels, repeated nondeterministic runs and service failure trials.','Report sample counts, budgets, error groups, model usage and end-to-end latency with uncertainty.'],
          ['Required: group submission package','Deep drafts report; Aarya prepares screenshots; whole group confirms contributions and grader access.','One 5–10 page report, reproducible setup, current branch/commit, final slides and actual demonstration.'],
          ['Optional after required work','Whole group: second entity/currency, broader public data, voice polish and extra risk enrichment.','Demonstrated benefit without weakening controls or delaying required evidence.']]),
        p('This contribution is complete as a Deep-branch draft and reproducible component-evaluation package. The group assignment remains incomplete until the required stakeholder, continuity and full-system evidence above is added. The source snapshots and current pilot should be retained when extending experiments.'),
      ],
      [
        h('Section 7  GitHub Repository and Team Contributions'),
        p(f'Repository: {REPO}. Branch: Deep. Evaluated code and pilot harness commit: {commit}. This report accompanies that reproducible code snapshot; the artifact commit is recorded in git history. Confirm the grader has repository access before submission.'),
        t(['Member / GitHub','Actual contributions supported by history','Representative evidence'],[
          ['Deep Nayak / Deep-nayak007','Seed/schema/validator; six scenario families and answer key; scoped retrieval/Moss adapter; scoring/reset/CRS lane; current retrieval pilots, evidence package and report draft.','92e7571; 2782fa3; 379b47c; 22def4c; '+commit[:7]],
          ['Prem Mahendra Pagare / prempagare07','Tool schemas and seat permissions; matcher and model proposer; deterministic controls; bank-hold guard; retrieval-grounded Ask Auditor.','07bcc44; 8f30503; acccebb; 3a624e5; e451f81; a67c387'],
          ['Christopher Lam / Christopher4113','Backend/schema/workflow integration; human decisions, injection/audit paths; public-source and integration work; team merges.','a760d60; 14971b9; 91f9771; 863b3a2; f962ed8'],
          ['Aarya Bhutkar / AaryaBhutkar','React workspace and source/review interface; controller drawers; deployment handoff describing actual sample-close limitations.','2d38fd2; b42f6a4; 24c0b02; 40c2466']]),
        ('links',[('Deep: data / retrieval',REPO+'/commit/2782fa3'),('Deep: pilot',REPO+'/commit/'+commit),('Prem: controls',REPO+'/commit/acccebb'),('Christopher: integration',REPO+'/commit/14971b9'),('Aarya: interface',REPO+'/commit/40c2466')]),
        p('Histories identify implementation evidence, not effort by commit count. Dataset preparation, local verification and writing in this package are documented directly. Stakeholder communication and other non-code work are not attributed without team confirmation. The group must confirm contact details and any additional members.'),
        h('Setup and reproduction'),
        ('code','corepack pnpm install --frozen-lockfile\nuv sync --locked --project retrieval\nuv run --project retrieval python evaluation/milestone2/evaluate.py\nuv run evaluation/milestone2/build_report.py'),
        p('The evaluation needs Python 3.12+ and uv; no credentials. The app additionally needs a selected Convex development deployment and model/retrieval configuration described in README.md. Configure those services deliberately before a live close; this report’s reproduction commands do not reset or deploy shared data.'),
        h('Validation and evidence index'),
        p('November 1 local checks: data 33 tests, retrieval 39, repository Vitest 266, evaluator 3: 341 passed. Convex/frontend TypeScript and frontend production build passed. The convenience typecheck script initially failed because nested pnpm was not on PATH; direct corepack invocations passed. Tests are regression evidence, not the full-system result table.'),
        p('Evidence: evaluation/milestone2/results/results.json and execution.txt; docs/milestone2/verification.md; datagen/README.md; retrieval/PHASE3.md; source files convex/agent.ts, close.ts, controls/rules.ts and ledger.ts. Local assignment template is preserved as template.docx. The original template’s seven sections are retained; missing group facts are explicitly marked.'),
      ],
    ]


def build():
    OUT.mkdir(parents=True,exist_ok=True)
    result=json.loads((RESULTS/'results.json').read_text())
    pages=content(result)
    doc=Document(OUT/'template.docx')
    doc.core_properties.author='Deep Nayak'
    doc.core_properties.title='Auditor — Capstone Milestone 2 group draft'
    body=doc.element.body
    for element in list(body):
        if element.tag!=qn('w:sectPr'): body.remove(element)
    for section in doc.sections:
        section.page_width=Inches(8.5); section.page_height=Inches(11)
        section.top_margin=Inches(.62); section.bottom_margin=Inches(.62)
        section.left_margin=Inches(.68); section.right_margin=Inches(.68)
        section.header_distance=Inches(.25); section.footer_distance=Inches(.25)
    normal=doc.styles['Normal']
    normal.font.name='Calibri'; normal.font.size=Pt(10.5)
    normal.paragraph_format.space_after=Pt(6)
    normal.paragraph_format.line_spacing=1.04
    for name,size in [('Title',21),('Heading 1',14),('Heading 2',12)]:
        doc.styles[name].font.name='Calibri'; doc.styles[name].font.size=Pt(size)
        doc.styles[name].font.color.rgb=RGBColor.from_string('173A5E')
    footer=doc.sections[0].footer.paragraphs[0]
    footer.alignment=1
    footer.add_run('Auditor • Group draft prepared by Deep • November 1, 2026 • ')
    fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)
    for r in footer.runs:r.font.size=Pt(8)

    fonts=[Path('/System/Library/Fonts/Supplemental'),Path('/usr/share/fonts/truetype/dejavu')]
    face='Helvetica'
    for directory in fonts:
        regular=directory/('Arial.ttf' if directory.name=='Supplemental' else 'DejaVuSans.ttf')
        bold=directory/('Arial Bold.ttf' if directory.name=='Supplemental' else 'DejaVuSans-Bold.ttf')
        italic=directory/('Arial Italic.ttf' if directory.name=='Supplemental' else 'DejaVuSans-Oblique.ttf')
        if all(p.exists() for p in [regular,bold,italic]):
            for name,path in [('M2',regular),('M2-Bold',bold),('M2-Oblique',italic)]:pdfmetrics.registerFont(TTFont(name,str(path)))
            pdfmetrics.registerFontFamily('M2',normal='M2',bold='M2-Bold',italic='M2-Oblique',boldItalic='M2-Bold')
            face='M2';break
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodyM2',fontName=face,fontSize=9.6,leading=12.4,spaceAfter=7,textColor=colors.HexColor('#172B42')))
    styles.add(ParagraphStyle(name='TableM2',fontName=face,fontSize=8,leading=10,spaceAfter=0))
    styles.add(ParagraphStyle(name='HeadM2',fontName=face+'-Bold',fontSize=13,leading=16,spaceBefore=3,spaceAfter=9,textColor=colors.HexColor('#173A5E')))
    styles.add(ParagraphStyle(name='TitleM2',fontName=face+'-Bold',fontSize=20,leading=25,spaceAfter=12,textColor=colors.HexColor('#173A5E')))
    styles.add(ParagraphStyle(name='CaptionM2',fontName=face+'-Oblique',fontSize=8,leading=10,spaceAfter=9))
    pdf=[]; md=[]
    safe=lambda text:escape(text).replace('\n','<br/>')
    for page_number,page in enumerate(pages):
        if page_number:
            doc.add_page_break(); pdf.append(PageBreak());md.append('\n<!-- page break -->\n')
        for block in page:
            kind=block[0]
            if kind in {'p','h','title'}:
                text=block[1]
                if kind=='p':doc.add_paragraph(text)
                else:doc.add_paragraph(text,style='Title' if kind=='title' else 'Heading 1')
                pdf.append(Paragraph(safe(text),styles[{'p':'BodyM2','h':'HeadM2','title':'TitleM2'}[kind]]))
                md.append(('# ' if kind=='title' else '## ' if kind=='h' else '')+text+'\n')
            elif kind=='table':
                headers,rows=block[1:]
                table=doc.add_table(rows=1,cols=len(headers));table.style='Table Grid'
                for cell,text in zip(table.rows[0].cells,headers):
                    cell.text=text
                    for run in cell.paragraphs[0].runs:run.bold=True
                for row in rows:
                    for cell,text in zip(table.add_row().cells,row):cell.text=text
                for index,row in enumerate(table.rows):
                    trpr=row._tr.get_or_add_trPr()
                    prevent=OxmlElement('w:cantSplit');trpr.append(prevent)
                    if index==0:
                        repeat=OxmlElement('w:tblHeader');trpr.append(repeat)
                    for cell in row.cells:
                        for paragraph in cell.paragraphs:
                            paragraph.paragraph_format.space_after=Pt(3)
                            paragraph.paragraph_format.space_before=Pt(2)
                            for run in paragraph.runs:run.font.size=Pt(8.7)
                n=len(headers)
                fractions=([.14,.25,.1,.1,.1,.11,.09,.11] if n==8 else [.28,.45,.27] if n==3 else [0.31,.69])
                table.autofit=False
                for column,fraction in zip(table.columns,fractions):column.width=Inches(7.14*fraction)
                for row in table.rows:
                    for cell,fraction in zip(row.cells,fractions):cell.width=Inches(7.14*fraction)
                widths=[514*f for f in fractions]
                data=[[Paragraph(safe(str(cell)),styles['TableM2']) for cell in row] for row in [headers,*rows]]
                tab=Table(data,colWidths=widths,hAlign='LEFT',repeatRows=1)
                tab.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E7EFF8')),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#B3C2D2')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
                pdf.extend([tab,Spacer(1,8)])
                md.extend(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*n)+' |',*['| '+' | '.join(row)+' |' for row in rows],''])
            elif kind=='image':
                filename,width,height,caption=block[1:]
                image_path=OUT/filename
                if not image_path.exists():raise FileNotFoundError(f'Render evidence first: {image_path}')
                doc.add_picture(str(image_path),width=Inches(width))
                paragraph=doc.add_paragraph(caption)
                for run in paragraph.runs:run.italic=True;run.font.size=Pt(8)
                from PIL import Image as PILImage
                with PILImage.open(image_path) as im: ratio=im.height/im.width
                pdf.extend([Image(str(image_path),width=width*72,height=width*72*ratio),Paragraph(safe(caption),styles['CaptionM2'])])
                md.append(f'![{caption}]({filename})\n')
            elif kind=='code':
                for line in block[1].splitlines():
                    para=doc.add_paragraph(line)
                    para.paragraph_format.space_after=Pt(1)
                    for run in para.runs:run.font.name='Consolas';run.font.size=Pt(8)
                    pdf.append(Paragraph(safe(line),styles['TableM2']))
                pdf.append(Spacer(1,8));md.append('```sh\n'+block[1]+'\n```\n')
            elif kind=='links':
                para=doc.add_paragraph()
                for index,(label,url) in enumerate(block[1]):
                    if index:para.add_run(' • ')
                    link=OxmlElement('w:hyperlink')
                    link.set(qn('r:id'),para.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True))
                    run=OxmlElement('w:r');prop=OxmlElement('w:rPr');color=OxmlElement('w:color');color.set(qn('w:val'),'176699');prop.append(color);run.append(prop)
                    text=OxmlElement('w:t');text.text=label;run.append(text);link.append(run);para._p.append(link)
                pdf.append(Paragraph(' • '.join(f'<link href="{escape(url)}" color="#176699">{safe(label)}</link>' for label,url in block[1]),styles['BodyM2']))
                md.append(' • '.join(f'[{label}]({url})' for label,url in block[1])+'\n')
    stem='CSE598-Milestone2-Deep-DRAFT'
    doc.save(OUT/(stem+'.docx'))
    def page_footer(canvas,document):
        canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#52657A'))
        canvas.drawCentredString(306,20,f'Auditor • Group draft prepared by Deep • November 1, 2026 • {document.page}')
    SimpleDocTemplate(str(OUT/(stem+'.pdf')),pagesize=(612,792),rightMargin=49,leftMargin=49,topMargin=45,bottomMargin=42,
        title='Auditor — Milestone 2 group draft prepared by Deep',author='Deep Nayak').build(pdf,onFirstPage=page_footer,onLaterPages=page_footer)
    (OUT/'report.md').write_text('\n'.join(md)+'\n')
    print(f'Built DOCX, PDF and Markdown from {len(pages)} intended pages in {OUT}')


if __name__=='__main__':build()
