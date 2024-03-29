// File: email.gas.gs
// Description: 
// This file contains all relevant functions for sending email.

// TODO_AJR - There is a flag in the grades sheet about whether a student has 
// been emailed yet. So could use this rather than shortening the email loop.

// TODO_AJR - Look for other menu handlers that can be nested.

// TODO_AJR - some of the local vars in sendEmail's nested functions
// are probably redundant.

// TODO_AJR - processGradesSheet() is called a second time in sendEmailGrades().

// TODO_AJR_BUG - If an email fails to send the email options window stays open.

// TODO_AJR - Assert script properties set if expected to be.

function sendEmailGrades()
{
  Debug.info("sendEmailGrades()");
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dp = PropertiesService.getDocumentProperties();
    
  // The object representing the grades sheet.
  
  // The send emails ui.
  var app = UiApp.getActiveApplication();
    
  // The zero-offset index of the email question in the submissions.
  var question_index = 0;
    
  // The text of the email address question.
  var question = dp.getProperty(DOC_PROP_EMAIL_ADDRESS_QUESTION);  
    
  // Whether to show answers in the student's 
  var show_answers = dp.getProperty(DOC_PROP_EMAIL_INCLUDE_ANSWER_KEY);
    
  // The message from the instructor in the student's 
  var instructor_message = dp.getProperty(DOC_PROP_EMAIL_INSTRUCTOR_MESSAGE);
    
  // Include question scores in the 
  var show_questions = dp.getProperty(DOC_PROP_EMAIL_INCLUDE_QUESTIONS_SCORES);
    
  // The email address of the instructor.
  var user_email_addr = dp.getProperty(DOC_PROP_EMAIL_INSTRUCTOR_ADDRESS);
  Debug.assert(user_email_addr !== null, "sendEmailGrades() - DOC_PROP_EMAIL_INSTRUCTOR_ADDRESS not set")

  var assignment_name = SpreadsheetApp.getActiveSpreadsheet().getName();
  
  // For English, remove "(Responses)" from the title, which is added by Google when
  // a new spreadsheet is created as the destination for form responses.
  assignment_name = assignment_name.replace(" (Responses)", "");
    
  var num_email_send_attempts = 0;
  
  var num_emails_sent = 0;
    
  var num_emails_unsent = 0;
  
  var got_grades_sheet = gotSheetWithGrades(ss);
  
  // TODO_AJR - Don't always need "graded full".
  
  var gws;
  
  // Initialise gws from the grades sheet.
  gws = new GradesWorksheet(ss, INIT_TYPE_GRADED_FULL);
  
  // Remove any HTML formatting from the instructor's message.
  // TODO_AJR - Could probably do something clever here with regex.
  instructor_message = instructor_message.replace("<", "&lt;");
  instructor_message = instructor_message.replace(">", "&gt;");
  instructor_message = instructor_message.replace("\n", "<br>");
  
  // Find out which question contains the email address.
  
  var first_graded_subm = gws.getFirstGradedSubmission();
  var q;
  
  for (q = first_graded_subm.getFirstQuestion(); 
       q !== null; 
       q = first_graded_subm.getNextQuestion(q))
    { 
      // Guaranteed to find it.
      if (q.getGradingOption() === GRADING_OPT_STUD_ID && 
          q.getFullQuestionText() === question)
        {
          // Note: we have to iterate to find it, as this list could 
          // be initiated from either the Student Submissions or 
          // Grades sheet, which may have different orders for 
          // the questions.
          break;
        }
    
      question_index++;
    }
  
  Debug.info("sendEmailGrades() - " + 
             "found email address at: " + question_index + " " +
             "with value: " + question);
  
  // TODO_AJR - 
  // 1) In autograed add the option to not send out an email, just grade it.
  // 2) to let the instructor decide if they get an email every time.
  
  // Send all of the student result emails.
  sendAllStudentEmails();

  // TODO_AJR - This shouldn't even be coming up for autograde.
  app.close();
  
  if ((num_emails_sent > 0) && !Autograde.isOn())
    {
      sendInstructorEmail();
    }
  
  // log (anonymously) that emails were sent for an assignment.
  // do only for manually graded assignments. this ensures consistency
  // with existing analytics, and also avoids pollution due to high use
  // of AutoGrade.
  if (!Autograde.isOn())
    {
      logEmail();
    }
  
  Debug.writeToFieldLogSheet();
  
  notifyNumberEmailsSent();
  
  return app;

  // Private functions.

  function sendAllStudentEmails()
  {
    var gs;
    var email_address;
    var msg_body;
    var pdf_certificate = null;
    var date = new Date();
    var html_body;
    var msg_title = langstr("FLB_STR_EMAIL_GRADES_EMAIL_SUBJECT") + 
                    ' "' + 
                    assignment_name + '"';
    
    var up = PropertiesService.getUserProperties();
    
    Debug.info("sendAllStudentEmails()");
    
    for (gs = gws.getFirstGradedSubmission(); 
         gs != null; 
         gs = gws.getNextGradedSubmission())
      {
        // Pull from grade sheet rather than the submissions sheet in case the 
        // instructor has edited the values inline.
        email_address = gs.getQuestionByIndex(question_index)
                          .getGradedVal();
        
         // trim any whitespace. a space after the address can cause sending to fail.
	     email_address = strTrim(email_address);
  
        if (!isValidEmailAddress(email_address) || gs.getAlreadyEmailed())
          {
            Debug.info("skipping email: '" + email_address + "'");
            num_emails_unsent++;
            continue;
          }
        
        num_email_send_attempts += 1;
        
        try
          {
            /*
            if (Autograde.isOn() && gs.score_percent > CERTIFICATE_PASS_PERCENTAGE)
              {          
                var keys = 
                  {
                    "<NAME>": gs.submission_vals[1],
                    "<Form Title>": assignment_name,
                    "<Submit Date>": date.toDateString(),
                    "<Submit Time>": date.toTimeString(),
                    "<Bar State>": gs.submission_vals[3],
                    "<Bar Number>": gs.submission_vals[4],
                    "<Hours of Credit>": gs.submission_vals[5],
                    "<Type of Credit>": gs.submission_vals[6]
                  }
          
                // TODO_AJR_CERT - Add more form values.
                // TODO_AJR_CERT - Add to 'send all emails' too. 
                pdf_certificate = createPdfCertificate(keys);
              }
              */
    
            // Initialize the key object for completing the certificate.
            
            // TODO_AJR - Convert to constants.
            // TODO_AJR - Assumes Name in second field.
            // TODO_AJR - They can all be pulled outo of submission_vals.
            
            html_body = constructGradesEmailBody(gs);
            var no_noreply = up.getProperty(USER_PROP_ADV_OPTION_NO_NOREPLY);
            no_noreply = no_noreply ? true : false;
            
            MailApp.sendEmail(email_address, 
                              msg_title, 
                              "",
                              {htmlBody: html_body, 
                               noReply: !no_noreply, 
                               name: "Flubaroo Grader",
                               attachments: pdf_certificate});
            
            num_emails_sent++;
              
            gs.recordEmailSentInGradesSheet();
            
            Debug.info("sendAllStudentEmail() - sent email to " + email_address);
          }
        catch (exception)
          {
            // Just ignore malformed emails or email errors.
            num_emails_unsent++;
          
            Debug.error("sendAllStudentEmails() - failed to send email to " + 
                        email_address + " " +
                        "Error: " + exception);
          }
      }
      
  } // sendAllStudentEmails()
    
  function sendInstructorEmail() 
  {
    var up = PropertiesService.getUserProperties();
    var no_noreply = up.getProperty(USER_PROP_ADV_OPTION_NO_NOREPLY);
    no_noreply = no_noreply ? true : false;        
    
    var msg_title = langstr("FLB_STR_EMAIL_RECORD_EMAIL_SUBJECT") + ": " + assignment_name;
    var msg_body = "<html><body><p>Below is a summary of the grades you just emailed:<b>";
    var email_notification;
    
    msg_body += "<table border=0 cellspacing=12>";
    
    msg_body += '<tr><td>' + 
                langstr("FLB_STR_EMAIL_RECORD_ASSIGNMENT_NAME") + 
                ':</td><td><b><a href="' + 
                ss.getUrl() + 
                '">' + 
                assignment_name + 
                "</a></b></td></tr>";
    
    msg_body += "<tr><td>" + 
                langstr("FLB_STR_EMAIL_RECORD_NUM_EMAILS_SENT") + 
                ":</td><td><b>" + 
                num_emails_sent + 
                "</b></td></tr>";
    
    msg_body += "<tr><td>" + 
                langstr("FLB_STR_EMAIL_RECORD_NUM_GRADED_SUBM") + 
                ":</td><td><b>" + 
                gws.getNumGradedSubmissions() + 
                "</b></td></tr>";
    
    msg_body += "<tr><td>" + 
                langstr("FLB_STR_EMAIL_RECORD_AVERAGE_SCORE") + 
                ":</td><td><b>" + 
                gws.getAverageScore() + 
                "</b></td></tr>";
    
    msg_body += "<tr><td>" + 
                langstr("FLB_STR_EMAIL_RECORD_POINTS_POSSIBLE") + 
                ":</td></td><b>" + 
                gws.getPointsPossible() + 
                "</b></td></tr>";
    
    msg_body += "<tr><td>" + 
                langstr("FLB_STR_EMAIL_RECORD_ANSWER_KEY_PROVIDED") + 
                "</td><td><b>";
    
    if (show_answers === 'true')
    {
      msg_body += langstr("FLB_STR_EMAIL_RECORD_ANSWER_KEY_YES");
    }
    else
    {
      msg_body += langstr("FLB_STR_EMAIL_RECORD_ANSWER_KEY_NO");
    }
    
    msg_body += "</b></td></tr></table>";
    
    if (instructor_message)
    {
      msg_body += "<p>" + 
                  langstr("FLB_STR_EMAIL_RECORD_INSTRUCTOR_MESSAGE") + 
                  ":<br><br>";
      
      msg_body += '<div style="padding-left:10px;padding-right:10px;' + 
                  'padding-top:10px;padding-bottom:10px;width:60%;' + 
                  'border:1px solid gray;">'; 
      
      msg_body += instructor_message + "</p></div>";
    }
    
    msg_body += "</body></html>";
    
    try
    {  
      MailApp.sendEmail(user_email_addr, 
                msg_title, 
                "",
                {htmlBody: msg_body, 
                 noReply: !no_noreply, 
                 name: "Flubaroo Grader"});
                 
       Debug.info("sendInstructorEmail() - sent email to " + user_email_addr);                 
    }
    catch (exception)
    {
      Debug.info("sendInstructorEmail() - failed to send email to instructor: " + 
             user_email_addr +
             " Error: " + 
             exception);
    }    
  } // sendInstructorEmail()
    
  function isValidEmailAddress(email_address)
  {
    if (!email_address)
      {
        Debug.info("isValidEmailAddress() - no email address");
        return false;
      }
    
    if (typeof email_address !== 'string')
      {
        Debug.warning("isValidEmailAddress() - parameter not a string");
        return false;
      }
    
    if (email_address.indexOf(' ') !== -1)
      {
        Debug.warning("isValidEmailAddress() - email contains spaces");      
        return false;
      }
    
    if (email_address.indexOf('@') === -1)
      {
        Debug.warning("isValidEmailAddress() - no @");          
        return false;
      }
    
    return true;
    
  } // isValidEmailAddress()
  
  // TODO_AJR - This isn't working yet.
  
  function sendEmail(recipient, subject, body, options)
  {
    var up = PropertiesService.getDocumentProperties();
    
    if (Debug.on())
      {
        if (up.getProperty(USER_PROP_SKIP_EMAIL))
          {
            // Email sending can be disabled in debug mode.
            MailApp.sendEmail(recipient, subject, body, options);
          }
      }
    else
      {
        MailApp.sendEmail(recipient, subject, body, options);
      }
    
  } // sendEmail()
  
  function constructGradesEmailBody(graded_subm)
  {   
    // Find out if any help tips were provided. if so, we'll want to include a column for them in the email.
    var help_tips_provided = graded_subm.getHelpTipsPresent();
    
    var msg_body = '<html><body bgcolor="white">';
     
    msg_body += '<p>' + langstr("FLB_STR_EMAIL_GRADES_EMAIL_BODY_START") + ' <b>' + assignment_name + '</b>. '
                      + langstr("FLB_STR_EMAIL_GRADES_DO_NOT_REPLY_MSG") + '.</p>';
     
    msg_body += '<div style="padding-left:10px;display:inline-block;border:1px solid black;">'; 
    
    msg_body += "<h2>" + 
                 langstr("FLB_STR_EMAIL_GRADES_YOUR_GRADE") + 
                 ": <b>" + 
                 graded_subm.getScorePoints() + 
                 " / " + 
                 gws.getPointsPossible() + 
                 "&nbsp;(" + floatToPrettyText(graded_subm.getScorePercent()) + "%)&nbsp;</h2></b></div>";
  
    if (instructor_message !== "")
       {
         msg_body += '<br><br>';
         msg_body += langstr("FLB_STR_EMAIL_GRADES_INSTRUCTOR_MSG_BELOW") + ':<br><br>';
         msg_body += '<div style="padding-left:10px;padding-right:10px;padding-top:10px;padding-bottom:10px;width:60%;border:1px solid gray;">';
         msg_body +=  instructor_message;
         msg_body += "</div>";
       }
    
    if (graded_subm.getStudentFeedback() !== "")
      {
         var student_feedback = graded_subm.getStudentFeedback();
         student_feedback = student_feedback.replace("<", "&lt;");
         student_feedback = student_feedback.replace(">", "&gt;");
         student_feedback = student_feedback.replace("\n", "<br>");
        
         msg_body += '<br><br>';
         msg_body += langstr("FLB_STR_EMAIL_GRADES_STUDENT_FEEDBACK_BELOW") + ':<br><br>';
         msg_body += '<div style="padding-left:10px;padding-right:10px;padding-top:10px;padding-bottom:10px;width:60%;border:1px solid gray;">';
         msg_body +=  student_feedback;
         msg_body += "</div>";
      }
    
    msg_body += "<br><p>" + langstr("FLB_STR_EMAIL_GRADES_SUBMISSION_SUMMARY") + ": ";
    
    msg_body += "<table border=0 cellspacing=12 width=80%>";
    
    for (var q = graded_subm.getFirstQuestion(); q != null; q = graded_subm.getNextQuestion(q))
      {
        if (q.getGradingOption() === GRADING_OPT_STUD_ID)
          {
            msg_body += "<tr><td>" + 
                        q.getFullQuestionText() + 
                        "</td><td>" + 
                        "<b>" + 
                        q.getFullSubmissionText() + 
                        "</b></td></tr>";
          }
      }
    
    msg_body += "<tr><td>" +
                langstr("FLB_STR_GRADE_STEP2_LABEL_SUBMISSION_TIME") + "</td><td>" +
                "<b>" + 
                graded_subm.getTimestamp() + 
                "</b></td></tr>";
    
    msg_body += "</table>";  
    msg_body += "</p>"; 
    
    if (show_questions === 'true')
      {
        var gopt;
        var grade_points_str = "";
        var grade_status = "";
        var q;
  
        for (q = graded_subm.getFirstQuestion(); 
             q != null; 
             q = graded_subm.getNextQuestion(q))
          {
            if (q.isTimestamp())
              {
                continue;
              }
            
            gopt = q.getGradingOption();
            
            if (gopt === GRADING_OPT_STUD_ID)
              {
                continue;
              }
        
            grade_points_str = "";
            grade_status = "";
        
            if (gopt === GRADING_OPT_SKIP)
              {
                grade_status = langstr("FLB_STR_NOT_GRADED");
                grade_points_str = "";
              }
            else
              {
                if (q.getGradedVal() > 0)
                  {
                    grade_status = langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_CORRECT");
                  }
                else
                  {
                    grade_status = langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_INCORRECT");
                  }
            
                if (q.getGradedVal() > 0)
                  {
                    grade_points_str = "+";
                  }
                
                grade_points_str += q.getGradedVal().toString() + " ";
                grade_points_str += langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_POINTS");
                
              } 
            
            msg_body += constructQuestionDiv(q, grade_status, grade_points_str, show_answers);
            
          } // for each question.
          
      } // if show_questions is true.
  
    msg_body += '<p><b>' + langstr("FLB_STR_EMAIL_GRADES_EMAIL_FOOTER") + '. ';
    
    msg_body += '<a href="http://www.flubaroo.com">' + 
                 langstr("FLB_STR_EMAIL_GRADES_VISIT_FLUBAROO") + 
                 '</a>.</b></p>'; 
    
    msg_body += "</body></html>";
    
    return msg_body;
    
    // Construct the html "div" for the question in the email.
    function constructQuestionDiv(graded_ques, 
                                  grade_status, 
                                  grade_points_str, 
                                  show_answers)
    {
      var bgcolor_red = "#FF4F4F";
      var bgcolor_green = "#44C93A";
      var bgcolor_gray = "#c0c0c0";
      
      var gopt = graded_ques.getGradingOption();
      
      if (gopt === GRADING_OPT_SKIP)
        {
          bgcolor = bgcolor_gray;
        }
      else if (graded_ques.getGradedVal() > 0)
        {
          bgcolor = bgcolor_green;
        } 
      else
        {
          bgcolor = bgcolor_red;
        }
      
      div_body = '<div style="width:600px;margin-left:10px;padding-left:15px;padding-right:15px;padding-top:10px;padding-bottom:20px;\
                  -webkit-border-radius: 20px;-moz-border-radius: 20px;border-radius: 20px;\
                  -webkit-box-shadow: #B3B3B3 10px 10px 10px;-moz-box-shadow: #B3B3B3 10px 10px 10px; box-shadow: #B3B3B3 10px 10px 10px;'
      div_body += 'background-color:' + bgcolor + ';">';
      
      div_body += '<span style="width:130px;float:right;padding-right:20px;">';
      div_body += '<div style="width:100%;font-size:xx-large;">' + grade_status + '</div>';
      div_body += '<div style="width:100%;padding-left:5px;">' + grade_points_str + '</div>';
      div_body += '</span>';
    
      div_body += '<p style="width:400px;font-size:large;">';
      div_body += '<b>' + graded_ques.getFullQuestionText() + '</b>';
      div_body += '</p>';
      
      div_body += '<p style="width:400px;font-size:medium;">';
      div_body += '<b>' + langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_YOUR_ANSWER_HEADER") + ': </b>' + graded_ques.getFullSubmissionText() + '</p>'; 
     
      if (grade_status === langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_INCORRECT") && 
          show_answers === 'true')
        {
          div_body += '<p style="width:400px;font-size:medium;">'
          div_body += '<b>' + langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_CORRECT_ANSWER_HEADER") + ': </b>' + graded_ques.getAnswerKeyText();
        }
    
      if (graded_ques.getHelpTip() !== "")
        {
          div_body += '<br><hr><b>' + langstr("FLB_STR_EMAIL_GRADES_SCORE_TABLE_HELP_TIP_HEADER")  + ':</b>';
          div_body += '<p style="width:400px;padding-left:25px;padding-top:8px;font-size:medium;">'
          div_body += '<i>' + graded_ques.getHelpTip() + '</i>';
          div_body += '</p>';
        }
      
      div_body += "</div><br><br>";
      
      return div_body;
      
    } // constructQuestionDiv()
        
  } // constructGradesEmailBody()
  
  function notifyNumberEmailsSent ()
  {  
    // No emails sent at all? Notify instructor.
    if (num_emails_sent == 0)
    {
      UI.msgBox(langstr("FLB_STR_NOTIFICATION"),
                langstr("FLB_STR_VIEW_EMAIL_GRADES_NO_EMAILS_SENT"),
                Browser.Buttons.OK);
      
      return;
    }

    // Else, some emails sent. Notify instructor of how many.
    email_notification = num_emails_sent + " " + langstr("FLB_STR_VIEW_EMAIL_GRADES_NUMBER_SENT") + ". "; 
        
    if (num_emails_unsent > 0) 
    { 
      email_notification += num_emails_unsent + " " + 
                           langstr("FLB_STR_VIEW_EMAIL_GRADES_NUMBER_UNSENT"); 
    } 
  
    UI.msgBox(langstr("FLB_STR_NOTIFICATION"), 
              email_notification, 
              Browser.Buttons.OK);  
  }

} // sendEmailGrades()

// menuEmailGrades
// ---------------
//
// Menu event handler.

function menuEmailGrades()
{
  Debug.info("menuEmailGrades()");
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Housecleaning. Set this to false anytime a user explicitly chooses to grade
  // the assignment. It could be left set if a user quit prematurely while
  // setting autograde options, which could in turn mess up the UI flow for 
  // normal grading.
  Autograde.clearGatheringOptions();
  
  // Check there is a grades sheet.  
  if (!gotSheetWithGrades(ss))
    {
      UI.msgBox(langstr("FLB_STR_NOTIFICATION"),
                langstr("FLB_STR_CANNOT_FIND_GRADES_MSG") + 
                  langstr("FLB_STR_SHEETNAME_GRADES"),
                Browser.Buttons.OK);

      Debug.error("menuEmailGrades() - no grades sheet");

      return;
    }

  var quota_remaining = MailApp.getRemainingDailyQuota();
	
  Debug.info("email quota remaining: " + quota_remaining);
  if (quota_remaining <= 0)
    {
      UI.msgBox(langstr("FLB_STR_NOTIFICATION"),
                langstr("FLB_STR_EMAIL_DAILY_QUOTA_EXCEEDED"),
                Browser.Buttons.OK);
      return;
    }
  
  if (UI.isOff())
    {
      // UI is off. Just skip straight to emailing the grades.
      sendEmailGrades();
      return;
    }
  
  // Display the email grades UI.
  var app = UI.emailGrades(ss);
  ss.show(app);
  
} // menuEmailGrades()
