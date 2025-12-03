// File location: /app/api/send-duty-change-email/route.js
// Hybrid solution: ASCII filename that's still readable

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('=== Email API Called (Brevo) ===');
    console.log('API Key exists:', !!process.env.BREVO_API_KEY);
    
    const { pdfData, formData } = await request.json();
    console.log('Received formData:', formData);

    // Convert base64 PDF data to buffer then to base64 string (Brevo format)
    const pdfBuffer = Buffer.from(pdfData.split(',')[1], 'base64');
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log('PDF buffer size:', pdfBuffer.length);

    // Create a hybrid filename: Form ID + romanized names + date
    // This avoids encoding issues while keeping it identifiable
    const monthYear = formData.selectedMonth.replace(/年|月/g, '');
    const filename = `FMEF-06-04_DutyChange_${formData.firstID}_${formData.secondID}_${monthYear}.pdf`;
    
    console.log('Filename:', filename);
    console.log('People:', formData.firstName, '&', formData.secondName);

    // Brevo email payload
    const emailPayload = {
      sender: {
        name: '豪神APP',
        email: 'hankengo@gmail.com'
      },
      to: [
        {
          email: 'MEI-CHING.HUANG@mandarin-airlines.com', //黃美菁
        },
        {
          email: '54610@mandarin-airlines.com', //卓湘琳
        }
      ],
      // Subject with dates included (only one set of dates)
      subject: `換班申請 - ${formData.firstName} & ${formData.secondName} - ${formData.firstDate}`,
      htmlContent: `
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
                  <p>📎 請查看附件中的完整換班申請單（PDF格式）</p>
                  <p>此郵件由豪神APP系統自動發送，請勿直接回覆此郵件。</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      textContent: `
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

請查看附件中的完整換班申請單（PDF格式）
      `,
      attachment: [
        {
          // Use ASCII-safe filename to avoid encoding issues
          // Format: FMEF-06-04_DutyChange_EmployeeID1_EmployeeID2_YearMonth.pdf
          name: filename,
          content: pdfBase64
        }
      ]
    };

    console.log('Sending email via Brevo...');

    // Send email using Brevo REST API
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify(emailPayload)
    });

    const result = await response.json();
    console.log('Brevo response:', result);

    if (!response.ok) {
      throw new Error(result.message || 'Email sending failed');
    }

    return NextResponse.json({ 
      success: true, 
      messageId: result.messageId,
      message: '郵件已成功發送',
      filename: filename,
      chineseFilename: `FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.pdf`
    });

  } catch (error) {
    console.error('=== Error sending email ===');
    console.error('Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || '郵件發送失敗',
        errorDetails: error.toString()
      },
      { status: 500 }
    );
  }
}