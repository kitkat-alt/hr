/**
 * Shift Master - Backend Logic (Auto-Setup Version)
 */

function doGet(e) {
  // ตรวจสอบและเตรียม Environment (Folder, Sheet, Password) ให้พร้อมใช้งาน
  const env = ensureEnvironment();

  // หากเป็น API Request
  if (e.parameter.period || e.parameter.dept) {
    return handleApiRequest(e, env);
  }
  
  // หากเปิดหน้าเว็บ
  const template = HtmlService.createTemplateFromFile('index');
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle('Shift Master')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  // ตรวจสอบ Environment ก่อนบันทึก
  ensureEnvironment();
  
  try {
    const payload = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();

    // 1. อัปเดตรหัสผ่าน
    if (payload.action === 'updatePassword') {
      props.setProperty('APP_PASSWORD', payload.newPassword);
      return responseJSON({ status: "success", message: "Password updated" });
    } 
    
    // 2. บันทึกข้อมูลตารางเวร
    else {
      const { period, dept, schedule, staff, highlightedDays, departments, staffRemarks } = payload;
      
      // -- บันทึกข้อมูลลง Script Properties (Fast Cache) --
      const storageKey = `shift_data_${period}_${dept}`;
      const periodData = {
        schedule: schedule,
        highlightedDays: highlightedDays,
        staffRemarks: staffRemarks || {}
      };
      props.setProperty(storageKey, JSON.stringify(periodData));
      
      // -- บันทึก Config --
      if (staff || departments) {
         const config = { departments, staff };
         props.setProperty('shift_master_config', JSON.stringify(config));
      }

      /** * [Optional] TODO: บันทึกลง Google Sheet (DB_SHEET_ID) 
       * หากต้องการเก็บ History ระยะยาว สามารถเขียนโค้ดเพิ่มตรงนี้เพื่อ Append Row ลง Sheet ได้
       */
      
      return responseJSON({ status: "success" });
    }
  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  }
}

// --- Helper: จัดการ API Request ---
function handleApiRequest(e, env) {
  const params = e.parameter;
  const period = params.period || "";
  const dept = params.dept || "";
  const props = PropertiesService.getScriptProperties();
  
  // ดึงข้อมูล
  const storageKey = `shift_data_${period}_${dept}`;
  const rawData = props.getProperty(storageKey);
  const data = rawData ? JSON.parse(rawData) : {};
  
  const globalData = props.getProperty('shift_master_config');
  const config = globalData ? JSON.parse(globalData) : { departments: [], staff: [] };

  const response = {
    schedule: data.schedule || {},
    highlightedDays: data.highlightedDays || [],
    staffRemarks: data.staffRemarks || {},
    staff: config.staff || [],
    departments: config.departments || [],
    appPassword: env.appPassword // ส่งรหัสผ่านปัจจุบันไปให้ Frontend
  };

  return responseJSON(response);
}

// --- Helper: Response JSON ---
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- CORE FUNCTION: Auto Setup Environment ---
function ensureEnvironment() {
  const props = PropertiesService.getScriptProperties();
  let scriptProps = props.getProperties();
  let updated = false;

  // 1. Setup Password (ถ้ายังไม่มี ให้ตั้งเป็น 199)
  if (!scriptProps.APP_PASSWORD) {
    props.setProperty('APP_PASSWORD', '199');
    scriptProps.APP_PASSWORD = '199';
    updated = true;
    console.log("Initialized Password: 199");
  }

  // 2. Setup Folder (ถ้ายังไม่มี ให้สร้าง Shift Master Data)
  if (!scriptProps.DRIVE_FOLDER_ID) {
    try {
      const folder = DriveApp.createFolder("Shift Master Data");
      const folderId = folder.getId();
      props.setProperty('DRIVE_FOLDER_ID', folderId);
      scriptProps.DRIVE_FOLDER_ID = folderId;
      updated = true;
      console.log("Created Folder: Shift Master Data");
    } catch (e) {
      console.error("Error creating folder: " + e.toString());
    }
  }

  // 3. Setup Spreadsheet (ถ้ายังไม่มี ให้สร้าง Shift Master DB ในโฟลเดอร์นั้น)
  if (!scriptProps.DB_SHEET_ID && scriptProps.DRIVE_FOLDER_ID) {
    try {
      const ss = SpreadsheetApp.create("Shift Master DB");
      const ssId = ss.getId();
      
      // ย้ายไฟล์ไปที่โฟลเดอร์
      const file = DriveApp.getFileById(ssId);
      const folder = DriveApp.getFolderById(scriptProps.DRIVE_FOLDER_ID);
      file.moveTo(folder);
      
      props.setProperty('DB_SHEET_ID', ssId);
      scriptProps.DB_SHEET_ID = ssId;
      updated = true;
      console.log("Created Sheet: Shift Master DB");
    } catch (e) {
       console.error("Error creating sheet: " + e.toString());
    }
  }

  return {
    appPassword: scriptProps.APP_PASSWORD,
    folderId: scriptProps.DRIVE_FOLDER_ID,
    sheetId: scriptProps.DB_SHEET_ID
  };
}
