import jsPDF from 'jspdf';

export interface AttachmentInfo {
  url: string;
  name: string;
  type: string;
}

export async function generateReportWithAttachments(
  reportContent: string,
  attachments: AttachmentInfo[],
  reportTitle: string
): Promise<Blob> {
  const doc = new jsPDF();
  
  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const lineHeight = 7;
  
  // Add title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, margin, yPosition);
  yPosition += 15;
  
  // Add report content
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  // Split content into lines that fit the page width
  const lines = doc.splitTextToSize(reportContent, pageWidth(doc) - 2 * margin);
  
  for (const line of lines) {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += lineHeight;
  }
  
  // Add attachments section
  if (attachments.length > 0) {
    yPosition += 10;
    
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Attachments', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    for (const attachment of attachments) {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      
      const isEmbeddable = isImageType(attachment.type);
      
      if (isEmbeddable) {
        try {
          // Try to embed image
          const imgData = await fetchImageAsBase64(attachment.url);
          const imgWidth = 50;
          const imgHeight = 50;
          
          if (yPosition + imgHeight > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          
          doc.addImage(imgData, 'JPEG', margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 5;
          
          doc.text(attachment.name, margin, yPosition);
          yPosition += lineHeight;
        } catch (error) {
          // If image fails, add as reference
          addAttachmentReference(doc, attachment, margin, yPosition);
          yPosition += lineHeight * 3;
        }
      } else {
        // Add reference for non-embeddable files
        addAttachmentReference(doc, attachment, margin, yPosition);
        yPosition += lineHeight * 3;
      }
      
      yPosition += 5;
    }
  }
  
  return doc.output('blob');
}

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function addAttachmentReference(doc: jsPDF, attachment: AttachmentInfo, x: number, y: number): void {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`File: ${attachment.name}`, x, y);
  y += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Type: ${attachment.type}`, x, y);
  y += 5;
  
  doc.setTextColor(0, 0, 255);
  doc.text(`Download: ${attachment.url}`, x, y);
  doc.setTextColor(0, 0, 0);
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
