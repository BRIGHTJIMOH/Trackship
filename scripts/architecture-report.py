#!/usr/bin/env python3
"""Export the repository architecture correction record to printable PDF/DOCX."""
from pathlib import Path
import argparse, html, re, subprocess
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default=str(root/'artifacts/architecture'));args=parser.parse_args()
out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
source=root/'docs/architecture/CORRECTIONS-2026-11-20.md';lines=source.read_text().splitlines()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='ReportBody',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=8));styles.add(ParagraphStyle(name='CellBody',fontName='Helvetica',fontSize=8.4,leading=11,spaceAfter=0))
styles['Heading1'].textColor=colors.HexColor('#254a38');styles['Heading1'].fontSize=15;styles['Heading1'].leading=19;styles['Heading1'].keepWithNext=True
pdf=[];doc=Document();section=doc.sections[0];section.top_margin=Inches(.75);section.bottom_margin=Inches(.75)
normal=doc.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10.5)
for style in ['Title','Heading 1','Heading 2']:doc.styles[style].font.color.rgb=RGBColor.from_string('254A38')
clean=lambda text:re.sub(r'`([^`]+)`',r'\1',text)
def paragraph(text,style='ReportBody'):
    pdf.append(Paragraph(html.escape(clean(text)),styles[style]))
    if style=='Heading1':doc.add_heading(clean(text),level=1)
    else:doc.add_paragraph(clean(text))
i=0
while i<len(lines):
    line=lines[i].strip();i+=1
    if not line:continue
    if line.startswith('# '):
        title=line[2:];pdf.extend([Paragraph(html.escape(title),styles['Title']),Spacer(1,8)]);doc.add_heading(title,0)
        paragraph('Source commit '+commit);continue
    if line.startswith('## '):paragraph(line[3:],'Heading1');continue
    if line.startswith('|'):
        rows=[[clean(c.strip()) for c in line.strip('|').split('|')]]
        while i<len(lines) and lines[i].strip().startswith('|'):
            row=lines[i].strip();i+=1
            if re.fullmatch(r'[| :\-]+',row):continue
            rows.append([clean(c.strip()) for c in row.strip('|').split('|')])
        table=Table([[Paragraph(html.escape(c),styles['CellBody']) for c in row] for row in rows],colWidths=[78,210,207],repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dce8d6')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#cbd7cd')),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));pdf.extend([table,Spacer(1,12)])
        t=doc.add_table(rows=0,cols=len(rows[0]));t.style='Table Grid'
        for row in rows:
            cells=t.add_row().cells
            for j,value in enumerate(row):cells[j].text=value
        continue
    paragraph(line)
base='SendRack-Architecture-Corrections-2026-11-20'
def footer(canvas,document):
    canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#647469'));canvas.drawString(42,25,'SendRack | Architecture corrections | 20 November 2026');canvas.drawRightString(A4[0]-42,25,str(document.page));canvas.restoreState()
SimpleDocTemplate(str(out/(base+'.pdf')),pagesize=A4,leftMargin=42,rightMargin=42,topMargin=42,bottomMargin=45,title='SendRack Architecture Corrections').build(pdf,onFirstPage=footer,onLaterPages=footer)
doc.save(out/(base+'.docx'))
print(str(out/(base+'.pdf')));print(str(out/(base+'.docx')))
