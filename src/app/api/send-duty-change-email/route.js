// File location: /app/api/send-duty-change-email/route.js
// Enhanced: User email copy + Resend fallback

import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/requireAuth';

export async function POST(request) {
  try {
    // Only logged-in users may send (verified login token)
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    console.log('=== Email API Called ===');
    console.log('Brevo API Key exists:', !!process.env.BREVO_API_KEY);
    console.log('Resend API Key exists:', !!process.env.RESEND_API_KEY);
    
    const { pdfData, formData } = await request.json();
    console.log('Received formData:', formData);

    // Convert base64 PDF data to buffer then to base64 string
    const pdfBuffer = Buffer.from(pdfData.split(',')[1], 'base64');
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log('PDF buffer size:', pdfBuffer.length);

    // Create a hybrid filename: Form ID + romanized names + date
    const monthYear = formData.selectedMonth.replace(/年|月/g, '');
    const filename = `FMEF-06-04_DutyChange_${formData.firstID}_${formData.secondID}_${monthYear}.pdf`;
    
    console.log('Filename:', filename);
    console.log('People:', formData.firstName, '&', formData.secondName);

    // Build recipient list - Add user's email for a copy
    const userEmail = `${formData.firstID}@mandarin-airlines.com`;
    const recipients = [
      // 管派組
      {
        email: 'MEI-CHING.HUANG@mandarin-airlines.com', //黃美菁
      },
      {
        email: '54610@mandarin-airlines.com', //卓湘琳
      },
      // User gets a copy
      {
        email: userEmail,
        name: formData.firstName
      }
    ];

    console.log('Sending to recipients:', recipients.map(r => r.email));

    // Prepare email content (shared between services)
    const emailSubject = `換班申請 - ${formData.firstName} & ${formData.secondName} - ${formData.firstDate}`;
    
    const emailHtmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: "Microsoft JhengHei", "PingFang TC", sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #0066cc;
              color: white;
              padding: 20px;
              border-radius: 5px 5px 0 0;
            }
            .content {
              background-color: #f9f9f9;
              padding: 20px;
              border: 1px solid #ddd;
              border-radius: 0 0 5px 5px;
            }
            .info-row {
              margin: 10px 0;
              padding: 10px;
              background-color: white;
              border-left: 3px solid #0066cc;
            }
            .label {
              font-weight: bold;
              color: #0066cc;
              display: inline-block;
              width: 120px;
            }
            .section-title {
              font-size: 18px;
              font-weight: bold;
              margin-top: 20px;
              margin-bottom: 10px;
              color: #0066cc;
            }
            .two-column-container {
              display: flex;
              gap: 30px;
              margin: 20px 0;
            }
            .column {
              flex: 1;
              min-width: 0;
            }
            .column .section-title {
              margin-top: 0;
            }
            @media (max-width: 600px) {
              .two-column-container {
                flex-direction: column;
              }
            }
            .footer {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
            }
            .filename-note {
              background-color: #fff3cd;
              border-left: 3px solid #ffc107;
              padding: 10px;
              margin-top: 15px;
              font-size: 13px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>客艙組員任務互換申請通知</h2>
            </div>
            
            <div class="content">
              <p>管派組 您好，</p>
              <p>收到一份新的任務互換申請，詳細資訊如下：</p>
              
              <div class="two-column-container">
                <div class="column">
                  <div class="section-title">📋 甲方資料</div>
                  <div class="info-row">
                    <span class="label">員工編號：</span>${formData.firstID}
                  </div>
                  <div class="info-row">
                    <span class="label">姓名：</span>${formData.firstName}
                  </div>
                  <div class="info-row">
                    <span class="label">職位：</span>${formData.firstRank}
                  </div>
                  <div class="info-row">
                    <span class="label">日期：</span>${formData.firstDate}
                  </div>
                  <div class="info-row">
                    <span class="label">任務：</span>${formData.firstTask}
                  </div>
                </div>
                
                <div class="column">
                  <div class="section-title">📋 乙方資料</div>
                  <div class="info-row">
                    <span class="label">員工編號：</span>${formData.secondID}
                  </div>
                  <div class="info-row">
                    <span class="label">姓名：</span>${formData.secondName}
                  </div>
                  <div class="info-row">
                    <span class="label">職位：</span>${formData.secondRank}
                  </div>
                  <div class="info-row">
                    <span class="label">日期：</span>${formData.secondDate}
                  </div>
                  <div class="info-row">
                    <span class="label">任務：</span>${formData.secondTask}
                  </div>
                </div>
              </div>
              
              <div class="info-row" style="border-left-color: #28a745;">
                <span class="label">申請日期：</span>${formData.applicationDate}
              </div>
              
              <div class="filename-note">
                <strong>📎 附件檔名：</strong>
                <div style="margin-top: 5px; font-family: monospace;">
                  FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.pdf
                </div>
                <div style="margin-top: 5px; color: #666; font-size: 12px;">
                  (檔案系統顯示為: ${filename})
                </div>
              </div>
              
              <div class="footer">
                <p>📎 請查收附件的換班申請單（PDF格式）</p>
                <p>此郵件由豪神APP系統自動發送，請勿直接回覆此郵件。</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailTextContent = `
客艙組員任務互換申請通知

甲方資料：
員工編號：${formData.firstID}
姓名：${formData.firstName}
職位：${formData.firstRank}
日期：${formData.firstDate}
任務：${formData.firstTask}

乙方資料：
員工編號：${formData.secondID}
姓名：${formData.secondName}
職位：${formData.secondRank}
日期：${formData.secondDate}
任務：${formData.secondTask}

申請日期：${formData.applicationDate}

附件檔名：FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.pdf
(檔案系統顯示為: ${filename})

請查看附件的換班申請單（PDF格式）
    `;

    // ============================================
    // PRIMARY: Try Brevo first
    // ============================================
    console.log('Attempting to send via Brevo...');
    
    if (process.env.BREVO_API_KEY) {
      try {
        const brevoPayload = {
          sender: {
            name: '豪神APP',
            email: 'hankengo@gmail.com'
          },
          to: recipients,
          subject: emailSubject,
          htmlContent: emailHtmlContent,
          textContent: emailTextContent,
          attachment: [
            {
              name: filename,
              content: pdfBase64
            }
          ]
        };

        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
          },
          body: JSON.stringify(brevoPayload)
        });

        const brevoResult = await brevoResponse.json();
        
        if (brevoResponse.ok) {
          console.log('✅ Brevo SUCCESS:', brevoResult);
          
          return NextResponse.json({ 
            success: true, 
            provider: 'Brevo',
            messageId: brevoResult.messageId,
            message: '郵件已成功發送 (Brevo)',
            filename: filename,
            chineseFilename: `FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.pdf`,
            recipients: recipients.map(r => r.email)
          });
        } else {
          console.error('❌ Brevo FAILED:', brevoResult);
          console.log('Brevo status:', brevoResponse.status);
          throw new Error(`Brevo failed: ${brevoResult.message || 'Unknown error'}`);
        }
      } catch (brevoError) {
        console.error('❌ Brevo error:', brevoError);
        console.log('⚠️ Falling back to Resend...');
        // Continue to fallback
      }
    } else {
      console.log('⚠️ Brevo API key not found, skipping to fallback...');
    }

    // ============================================
    // FALLBACK: Use Resend if Brevo failed
    // ============================================
    console.log('Attempting to send via Resend...');
    
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Both Brevo and Resend failed. No API keys available.');
    }

    // Get verified sender email from environment variable
    // This should be your verified domain email (e.g., noreply@yourdomain.com)
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';

    // Resend email payload
    const resendPayload = {
      from: `豪神APP <${resendFromEmail}>`,
      to: recipients.map(r => r.email),
      subject: emailSubject,
      html: emailHtmlContent,
      text: emailTextContent,
      attachments: [
        {
          filename: filename,
          content: pdfBase64
        }
      ]
    };

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resendPayload)
    });

    const resendResult = await resendResponse.json();
    
    if (!resendResponse.ok) {
      console.error('❌ Resend FAILED:', resendResult);
      throw new Error(`Resend failed: ${resendResult.message || resendResult.error || 'Unknown error'}`);
    }

    console.log('✅ Resend SUCCESS:', resendResult);

    return NextResponse.json({ 
      success: true, 
      provider: 'Resend (Fallback)',
      messageId: resendResult.id || 'resend-success',
      message: '郵件已成功發送 (Resend備用系統)',
      filename: filename,
      chineseFilename: `FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.pdf`,
      recipients: recipients.map(r => r.email),
      note: 'Brevo失敗，已使用Resend備用系統發送'
    });

  } catch (error) {
    console.error('=== Error sending email ===');
    console.error('Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || '郵件發送失敗',
        errorDetails: error.toString(),
        note: '所有郵件服務皆失敗，請檢查API金鑰設定'
      },
      { status: 500 }
    );
  }
}