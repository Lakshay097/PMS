import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues, createSheet } from './googleSheetsService';
import { logger } from '../utils/logger';

export interface EmailTemplate {
  templateName: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    templateName: 'template_assigned_email',
    subject: 'New task assigned: {Title}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h2 style="color: #333; margin-top: 0;">New Task Assignment</h2>
    <p style="color: #666; line-height: 1.6;">Hello {AssignedToName},</p>
    <p style="color: #666; line-height: 1.6;">You have been assigned a new task. Please review the details below:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f9; font-weight: bold; color: #333; border-bottom: 2px solid #ddd;">Task ID</td>
        <td style="padding: 12px; background-color: #f9f9f9; color: #666; border-bottom: 2px solid #ddd;">{TaskID}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Title</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{Title}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Priority</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{Priority}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Due Date</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{DueDate}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Assigned By</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{AssignedByEmail}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Description</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{Description}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333;">Attachment</td>
        <td style="padding: 12px; color: #666;">{AttachmentLink}</td>
      </tr>
    </table>
    
    <p style="color: #666; line-height: 1.6;">Please review the task and begin working on it at your earliest convenience.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated email from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>{AssignedByName}</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_delayed_email',
    subject: 'Task due in 24 hours: {Title}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #ffc107;">
    <h2 style="color: #856404; margin-top: 0;">⚠️ Task Due Soon</h2>
    <p style="color: #666; line-height: 1.6;">Hello {AssignedToName},</p>
    <p style="color: #666; line-height: 1.6;">The following task is due within 24 hours:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #fff9e6; font-weight: bold; color: #333; border-bottom: 2px solid #ffc107;">Task ID</td>
        <td style="padding: 12px; background-color: #fff9e6; color: #666; border-bottom: 2px solid #ffc107;">{TaskID}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Title</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{Title}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Priority</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{Priority}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333;">Due Date</td>
        <td style="padding: 12px; color: #666;">{DueDate}</td>
      </tr>
    </table>
    
    <p style="color: #666; line-height: 1.6;">Please ensure you complete this task on time.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated reminder from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>{AssignedByName}</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'report_submitted',
    subject: 'Progress Report: {task_name} [{task_id}]',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #e3f2fd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #2196f3;">
    <h2 style="color: #0d47a1; margin-top: 0;">📊 Progress Report Submitted</h2>
    <p style="color: #666; line-height: 1.6;">Hello {AllocatorName},</p>
    <p style="color: #666; line-height: 1.6;">A progress report has been submitted for the following task:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #e3f2fd; font-weight: bold; color: #333; border-bottom: 2px solid #2196f3;">Task</td>
        <td style="padding: 12px; background-color: #e3f2fd; color: #666; border-bottom: 2px solid #2196f3;">{task_name}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Task ID</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{task_id}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Submitted By</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{SubmittedByName}</td>
      </tr>
    </table>
    
    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #333;">Report Content:</p>
      <p style="margin: 10px 0 0 0; color: #666; line-height: 1.6;">{report_content}</p>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>{SubmittedByName}</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'task_closed',
    subject: 'Task Closed: {task_name} [{task_id}]',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #d4edda;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #28a745;">
    <h2 style="color: #155724; margin-top: 0;">✅ Task Closed</h2>
    <p style="color: #666; line-height: 1.6;">Hello {AssignedToName},</p>
    <p style="color: #666; line-height: 1.6;">The following task has been marked as closed:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #d4edda; font-weight: bold; color: #333; border-bottom: 2px solid #28a745;">Task</td>
        <td style="padding: 12px; background-color: #d4edda; color: #666; border-bottom: 2px solid #28a745;">{task_name}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Task ID</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{task_id}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Closed By</td>
        <td style="padding: 12px; color: #666; border-bottom: 1px solid #eee;">{ClosedByName}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333;">Completion Date</td>
        <td style="padding: 12px; color: #666;">{completion_date}</td>
      </tr>
    </table>
    
    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #333;">Close Remarks:</p>
      <p style="margin: 10px 0 0 0; color: #666; line-height: 1.6;">{close_remark}</p>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>{ClosedByName}</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_scheduled_reminder',
    subject: 'Weekly Report Reminder: Submit PPT by Friday for {TeamName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #ffc107;">
    <h2 style="color: #856404; margin-top: 0;">📅 Weekly Report Reminder</h2>
    <p style="color: #666; line-height: 1.6;">Hello,</p>
    <p style="color: #666; line-height: 1.6;">This is a reminder for team leaders of team <strong>{TeamName}</strong> to submit the weekly PPT report by Friday.</p>
    
    <div style="background-color: #fff9e6; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #333; font-weight: bold;">Please log in and upload your PPT:</p>
      <a href="{AppURL}" style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #ffc107; color: #333; text-decoration: none; border-radius: 4px; font-weight: bold;">Open PMS Portal</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated reminder from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>PMS Team</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_proof_email',
    subject: 'Weekly Report Proof: {DisplayName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #e3f2fd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #2196f3;">
    <h2 style="color: #0d47a1; margin-top: 0;">📋 Weekly Report Proof of Submission</h2>
    <p style="color: #666; line-height: 1.6;">Weekly report proof of submission for <strong>{DisplayName}</strong></p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #e3f2fd; font-weight: bold; color: #333; border-bottom: 2px solid #2196f3;">Submitted By</td>
        <td style="padding: 12px; background-color: #e3f2fd; color: #666; border-bottom: 2px solid #2196f3;">{SubmittedBy}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold; color: #333;">Submitted At</td>
        <td style="padding: 12px; color: #666;">{SubmittedAt}</td>
      </tr>
    </table>
    
    {NoteSection}
    {AttachmentsSection}
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the PMS Task Management System.</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_report_onboarding',
    subject: 'Welcome to Weekly Reports - {TeamName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #e8f5e9;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #4caf50;">
    <h2 style="color: #2e7d32; margin-top: 0;">🎉 Welcome to Weekly Reports</h2>
    <p style="color: #666; line-height: 1.6;">Hello,</p>
    <p style="color: #666; line-height: 1.6;">Welcome to the weekly reporting process for team <strong>{TeamName}</strong>.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #e8f5e9; font-weight: bold; color: #333; border-bottom: 2px solid #4caf50;">Meeting Day</td>
        <td style="padding: 12px; background-color: #e8f5e9; color: #666; border-bottom: 2px solid #4caf50;">{day}</td>
      </tr>
    </table>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #333; margin-bottom: 10px;">Login Credentials:</p>
      <p style="margin: 5px 0; color: #666;"><strong>Email:</strong> {OfficialWorkMail}</p>
      <p style="margin: 5px 0; color: #666;"><strong>Password:</strong> {TemporaryPassword}</p>
    </div>
    
    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
      <a href="{AppURL}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Access PMS Portal</a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin: 20px 0;">Please submit your report by the deadline.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>PMS Team</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_report_reminder',
    subject: 'Weekly Report Reminder - {TeamName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #ffc107;">
    <h2 style="color: #856404; margin-top: 0;">📅 Weekly Report Reminder</h2>
    <p style="color: #666; line-height: 1.6;">Hello,</p>
    <p style="color: #666; line-height: 1.6;">This is a reminder for team <strong>{TeamName}</strong> to submit your weekly report.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #fff9e6; font-weight: bold; color: #333; border-bottom: 2px solid #ffc107;">Meeting Day</td>
        <td style="padding: 12px; background-color: #fff9e6; color: #666; border-bottom: 2px solid #ffc107;">{day}</td>
      </tr>
    </table>
    
    <div style="background-color: #fff9e6; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #333; font-weight: bold;">Please log in and submit your report:</p>
      <a href="{AppURL}" style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #ffc107; color: #333; text-decoration: none; border-radius: 4px; font-weight: bold;">Open PMS Portal</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated reminder from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards,<br>PMS Team</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_scheduled_report_first',
    subject: 'Scheduled Report Submission - {TeamName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #e3f2fd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #2196f3;">
    <h2 style="color: #0d47a1; margin-top: 0;">📝 Scheduled Report Submission</h2>
    <p style="color: #666; line-height: 1.6;">Hello,</p>
    <p style="color: #666; line-height: 1.6;">To ensure timely preparation for scheduled review meetings, please submit your review document through the portal at least one day before the scheduled meeting that is on <strong>{day}</strong> (PPT preferred).</p>
    
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #333; margin-bottom: 10px;">Login Credentials (for first-time users):</p>
      <p style="margin: 5px 0; color: #666;"><strong>Email:</strong> {OfficialWorkMail}</p>
      <p style="margin: 5px 0; color: #666;"><strong>Temporary Password:</strong> {TemporaryPassword}</p>
      <p style="margin: 15px 0 5px 0; color: #666; font-style: italic;">For security reasons, please change your password after your first login.</p>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
      <a href="{AppURL}" style="display: inline-block; padding: 12px 24px; background-color: #2196f3; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Access PMS Portal</a>
    </div>
    
    <div style="background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <p style="margin: 0; color: #856404; font-weight: bold;">⚠️ Important:</p>
      <p style="margin: 10px 0 0 0; color: #666; line-height: 1.6;">Please coordinate to select the time of the meeting.</p>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin: 20px 0;">Thank you for your cooperation.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_scheduled_report_reminder',
    subject: 'Scheduled Report Submission - {TeamName}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #ffc107;">
    <h2 style="color: #856404; margin-top: 0;">📅 Scheduled Report Reminder</h2>
    <p style="color: #666; line-height: 1.6;">Hello,</p>
    <p style="color: #666; line-height: 1.6;">This is a reminder to submit the scheduled report for <strong>{TeamName}</strong> at least one day before the scheduled review meeting (PPT preferred).</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 12px; background-color: #fff9e6; font-weight: bold; color: #333; border-bottom: 2px solid #ffc107;">Meeting Day</td>
        <td style="padding: 12px; background-color: #fff9e6; color: #666; border-bottom: 2px solid #ffc107;">{day}</td>
      </tr>
    </table>
    
    <div style="background-color: #fff9e6; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #333; font-weight: bold;">Please log in and upload the report:</p>
      <a href="{AppURL}" style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #ffc107; color: #333; text-decoration: none; border-radius: 4px; font-weight: bold;">Open PMS Portal</a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin: 20px 0;">Timely submission will help ensure the process runs smoothly.</p>
    
    <p style="color: #666; line-height: 1.6; margin: 20px 0;">Thank you for your cooperation.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p style="margin: 0;">This is an automated reminder from the PMS Task Management System.</p>
      <p style="margin: 5px 0 0 0;">Best regards</p>
    </div>
  </div>
</div>`,
    updatedAt: new Date().toISOString(),
  },
];

export async function initializeEmailTemplatesSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A1:D1');
    if (existingValues && existingValues.length > 0) return true;

    await createSheet(tokenData.accessToken, spreadsheetId, 'email_templates');
    await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [['template_name', 'subject', 'body', 'updated_at']]);

    for (const template of DEFAULT_TEMPLATES) {
      await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [
        [template.templateName, template.subject, template.body, template.updatedAt],
      ]);
    }

    logger.info('Initialized email_templates sheet with default templates');
    return true;
  } catch (err) {
    logger.error('Error initializing email_templates sheet:', err);
    return false;
  }
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return DEFAULT_TEMPLATES;

    const values = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'email_templates!A:D');
    if (!values || values.length < 2) return DEFAULT_TEMPLATES;

    const templates: EmailTemplate[] = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        templates.push({ templateName: row[0], subject: row[1] || '', body: row[2] || '', updatedAt: row[3] || new Date().toISOString() });
      }
    }

    for (const def of DEFAULT_TEMPLATES) {
      if (!templates.find(t => t.templateName === def.templateName)) {
        templates.push(def);
      }
    }

    return templates;
  } catch (err) {
    logger.error('Error getting email templates:', err);
    return DEFAULT_TEMPLATES;
  }
}

export async function getEmailTemplate(templateName: string): Promise<EmailTemplate | null> {
  const templates = await getEmailTemplates();
  let template = templates.find(t => t.templateName === templateName);

  if (!template && (templateName === 'task_due_soon' || templateName === 'task_overdue')) {
    template = templates.find(t => t.templateName === 'template_delayed_email');
  }
  if (!template) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === templateName);
  }
  if (!template && (templateName === 'task_due_soon' || templateName === 'task_overdue')) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === 'template_delayed_email');
  }

  return template || null;
}

export async function saveEmailTemplate(template: EmailTemplate): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A:D');
    if (!values) return false;

    const now = new Date().toISOString();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === template.templateName) { rowIndex = i; break; }
    }

    const row = [template.templateName, template.subject, template.body, now];

    if (rowIndex > 0) {
      return updateSheetValues(tokenData.accessToken, spreadsheetId, `email_templates!A${rowIndex + 1}:D${rowIndex + 1}`, [row]);
    }
    return appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [row]);
  } catch (err) {
    logger.error('Error saving email template:', err);
    return false;
  }
}

/**
 * Reset a specific template to its default value
 */
export async function resetTemplateToDefault(templateName: string): Promise<boolean> {
  try {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.templateName === templateName);
    if (!defaultTemplate) {
      logger.error(`Template ${templateName} not found in defaults`);
      return false;
    }

    return await saveEmailTemplate({
      ...defaultTemplate,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Error resetting template to default:', err);
    return false;
  }
}

/**
 * Replaces {variable} placeholders in a template string.
 *
 * FIX — two improvements:
 * 1. Alias expansion runs first to unify snake_case ↔ PascalCase keys into expandedVars.
 * 2. Replacement is done in a deterministic order: longer keys first, so a key like
 *    {task_name} is never partially consumed by a shorter overlapping key.
 * 3. A final safety scan logs any remaining {placeholders} so they're visible in logs.
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return '';

  // Step 1: expand aliases so both snake_case and PascalCase keys are available
  const expandedVars: Record<string, string> = { ...variables };

  const mappings: Array<[string, string[]]> = [
    ['Title',           ['task_name', 'Title']],
    ['TaskID',          ['task_id', 'TaskID']],
    ['Description',     ['description', 'Description', 'task_description', 'TaskDescription']],
    ['Priority',        ['priority', 'Priority']],
    ['DueDate',         ['due_date', 'DueDate']],
    ['AssignedToEmail', ['assigned_to', 'AssignedToEmail']],
    ['AssignedByEmail', ['assigned_by', 'AssignedByEmail']],
    ['ReportContent',   ['report_content', 'ReportContent']],
    ['AppUrl',          ['app_url', 'AppUrl', 'AppURL']],
    ['close_remark',    ['close_remark', 'CloseRemark']],
    ['closed_by',       ['closed_by', 'ClosedBy']],
    ['completion_date', ['completion_date', 'CompletionDate']],
    ['report_content',  ['report_content', 'ReportContent']],
    ['task_name',       ['task_name', 'Title']],
    ['task_id',         ['task_id', 'TaskID']],
    ['due_date',        ['due_date', 'DueDate']],
    ['priority',        ['priority', 'Priority']],
    ['assigned_to',     ['assigned_to', 'AssignedToEmail']],
    ['TeamName',        ['TeamName', 'team_name', 'teamName']],
    ['day',             ['day', 'meeting_day', 'meetingDay']],
    ['OfficialWorkMail',['OfficialWorkMail', 'official_work_mail', 'officialWorkMail']],
    ['TemporaryPassword',['TemporaryPassword', 'temporary_password', 'temporaryPassword']],
  ];

  for (const [standardKey, aliasKeys] of mappings) {
    let foundValue: string | undefined;
    for (const key of aliasKeys) {
      if (variables[key] !== undefined && variables[key] !== '') {
        foundValue = variables[key];
        break;
      }
    }
    if (foundValue !== undefined) {
      // Populate the standard key and all its aliases
      expandedVars[standardKey] = foundValue;
      for (const key of aliasKeys) {
        expandedVars[key] = foundValue;
      }
    }
  }

  // Step 2: replace in longest-key-first order to avoid partial matches
  // e.g. replace {AssignedByEmail} before {AssignedToEmail} or {assigned_to}
  let result = template;
  const sortedKeys = Object.keys(expandedVars).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = expandedVars[key] ?? '';
    // Double-brace first, then single-brace
    result = result.split(`{{${key}}}`).join(val);
    result = result.split(`{${key}}`).join(val);
  }

  // Step 3: warn about any remaining placeholders
  const remaining = [...result.matchAll(/\{[^}]+\}/g)].map(m => m[0]);
  if (remaining.length > 0) {
    logger.warn(`replaceTemplateVariables: unreplaced placeholders: ${remaining.join(', ')}`);
  }

  return result;
}