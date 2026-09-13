#!/usr/bin/env python3
"""
OCR Pipeline for JAMB Past Questions using PaddleX.
Converts PDF pages to images, runs OCR, parses questions, and uploads to Supabase.
"""
import os
import sys
import json
import argparse
import re
from pathlib import Path
from typing import List, Dict, Any
import fitz  # PyMuPDF
from pdf2image import convert_from_path
from supabase import create_client

try:
    import paddlex as pdx
    PADDLEX_AVAILABLE = True
except ImportError:
    PADDLEX_AVAILABLE = False
    print("WARNING: PaddleX not available, OCR will be skipped")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

PDF_DIR = Path("pdfs")
OUTPUT_DIR = Path("ocr_output")
QUESTIONS_DIR = OUTPUT_DIR / "questions"
OUTPUT_DIR.mkdir(exist_ok=True)
QUESTIONS_DIR.mkdir(exist_ok=True)

SUBJECTS = ["biology", "physics", "chemistry", "mathematics", "english"]

def get_ocr_model():
    if not PADDLEX_AVAILABLE:
        return None
    pipeline = pdx.create_pipeline("OCR")
    return pipeline

def pdf_to_images(pdf_path: Path, dpi: int = 300) -> List[Path]:
    output_paths = []
    doc = fitz.open(pdf_path)
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        
        img_path = OUTPUT_DIR / f"{pdf_path.stem}_page_{page_num + 1:04d}.png"
        pix.save(str(img_path))
        output_paths.append(img_path)
    
    doc.close()
    return output_paths

def run_ocr_on_image(pipeline, image_path: Path) -> List[Dict]:
    if not pipeline:
        return []
    
    try:
        result = pipeline.predict(str(image_path))
        ocr_results = []
        for res in result:
            if hasattr(res, 'text') and hasattr(res, 'score'):
                ocr_results.append({
                    "text": res.text,
                    "confidence": res.score,
                    "bbox": getattr(res, 'bbox', None)
                })
        return ocr_results
    except Exception as e:
        print(f"OCR error on {image_path}: {e}")
        return []

def parse_questions_from_text(text: str, subject: str, year: int = None) -> List[Dict]:
    questions = []
    lines = text.split('\n')
    
    current_question = {}
    in_options = False
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        q_match = re.match(r'^(?:Question\s+)?(\d+)[\.\)]\s*(.+)', line, re.IGNORECASE)
        if q_match:
            if current_question.get('question_text'):
                questions.append(current_question)
            current_question = {
                'subject': subject,
                'year': year,
                'question_number': int(q_match.group(1)),
                'question_text': q_match.group(2),
                'options': [],
                'correct_answer': '',
                'explanation': ''
            }
            in_options = False
            continue
        
        opt_match = re.match(r'^([A-D])[\.\)]\s*(.+)', line)
        if opt_match and current_question.get('question_text'):
            current_question['options'].append(opt_match.group(2))
            in_options = True
            continue
        
        ans_match = re.match(r'^(?:Answer|Correct)[:\s]+([A-D])', line, re.IGNORECASE)
        if ans_match and current_question.get('options'):
            idx = ord(ans_match.group(1).upper()) - ord('A')
            if 0 <= idx < len(current_question['options']):
                current_question['correct_answer'] = current_question['options'][idx]
            continue
        
        exp_match = re.match(r'^(?:Explanation|Solution)[:\s]+(.+)', line, re.IGNORECASE)
        if exp_match:
            current_question['explanation'] = exp_match.group(1)
            continue
        
        if current_question.get('question_text') and not in_options and not ans_match and not exp_match:
            if not re.match(r'^(?:Question\s+)?\d+[\.\)]', line):
                current_question['question_text'] += ' ' + line
    
    if current_question.get('question_text'):
        questions.append(current_question)
    
    return questions

def process_subject(subject: str, pipeline, year: int = None) -> List[Dict]:
    all_questions = []
    pdf_path = PDF_DIR / f"{subject}.pdf"
    
    if not pdf_path.exists():
        print(f"No PDF found for {subject}")
        return all_questions
    
    print(f"Processing {subject}...")
    
    images = pdf_to_images(pdf_path)
    print(f"  Converted to {len(images)} images")
    
    for i, img_path in enumerate(images):
        print(f"  OCR page {i+1}/{len(images)}...")
        ocr_results = run_ocr_on_image(pipeline, img_path)
        
        page_text = " ".join([r['text'] for r in ocr_results if r['text']])
        
        if page_text:
            questions = parse_questions_from_text(page_text, subject, year)
            all_questions.extend(questions)
            print(f"    Found {len(questions)} questions on page {i+1}")
    
    return all_questions

def upload_to_supabase(questions: List[Dict]) -> int:
    if not questions:
        return 0
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Supabase credentials not configured")
        return 0
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    uploaded = 0
    
    for q in questions:
        existing = supabase.table("jamb_questions").select("id").eq("subject", q['subject']).eq("year", q.get('year', 0)).eq("question_number", q['question_number']).execute()
        
        if existing.data:
            continue
        
        try:
            supabase.table("jamb_questions").insert({
                "subject": q['subject'],
                "year": q.get('year'),
                "question_number": q['question_number'],
                "question_text": q['question_text'],
                "options": q['options'],
                "correct_answer": q['correct_answer'],
                "explanation": q.get('explanation', ''),
                "topic": q.get('topic', ''),
                "difficulty": q.get('difficulty', 'medium')
            }).execute()
            uploaded += 1
        except Exception as e:
            print(f"Failed to insert question: {e}")
    
    return uploaded

def save_questions_locally(subject: str, questions: List[Dict]):
    output_file = QUESTIONS_DIR / f"{subject}_questions.json"
    with open(output_file, 'w') as f:
        json.dump(questions, f, indent=2)
    print(f"  Saved {len(questions)} questions to {output_file}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", default="all")
    parser.add_argument("--reprocess", default="false")
    parser.add_argument("--year", type=int)
    args = parser.parse_args()
    
    if not PADDLEX_AVAILABLE:
        print("ERROR: PaddleX not available")
        sys.exit(1)
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Supabase credentials not set")
        sys.exit(1)
    
    print("Initializing OCR pipeline...")
    pipeline = get_ocr_model()
    
    subjects = [args.subject] if args.subject != "all" else SUBJECTS
    
    total_uploaded = 0
    
    for subject in subjects:
        questions = process_subject(subject, pipeline, args.year)
        
        if questions:
            save_questions_locally(subject, questions)
            
            uploaded = upload_to_supabase(questions)
            total_uploaded += uploaded
            print(f"  Uploaded {uploaded} new questions for {subject}")
    
    print(f"\nTotal questions uploaded: {total_uploaded}")

if __name__ == "__main__":
    main()