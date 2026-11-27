-- Travel Tracker -> Supabase
-- รันทั้งไฟล์นี้ใน Supabase Dashboard > SQL Editor (ครั้งเดียว)
-- ตารางเดียวเก็บทุกแท็บในรูปแถว/เซลล์ (เหมือนชีต) แอปอ่านผ่าน publishable key เท่านั้น (อ่านได้อย่างเดียว)
create table if not exists public.sheet_rows (
  tab    text   not null,
  row_no int    not null,
  cells  jsonb  not null default '[]'::jsonb,
  primary key (tab, row_no)
);
alter table public.sheet_rows enable row level security;
drop policy if exists "read all" on public.sheet_rows;
create policy "read all" on public.sheet_rows for select to anon, authenticated using (true);
-- ไม่มี policy เขียน: anon เขียนไม่ได้ แก้ข้อมูลผ่าน Table Editor / SQL Editor เท่านั้น

delete from public.sheet_rows;

-- plan: 25 rows
insert into public.sheet_rows (tab, row_no, cells) values
('plan', 0, '["Day", "Start time", "Start Location", "Arrive time", "Arrive Location", "How to Travel", "Note"]'::jsonb),
('plan', 1, '["13-ก.พ.", "10.05", "Suvarnabhumi Airport", "15.20", "Almaty International Airport", "Airplane", "KC932"]'::jsonb),
('plan', 2, '["", "15.20 - 17.00 น. ผ่านตม. + อื่นๆ"]'::jsonb),
('plan', 3, '["", "17.00", "Almaty International Airport", "", "ที่พัก", "Yandex Go", "Check-In: เก็บสัมภาระ พักผ่อนล้างหน้าล้างตา"]'::jsonb),
('plan', 4, '["", "", "ที่พัก", "", "Arbat Street"]'::jsonb),
('plan', 5, '["", "เดินเล่น + หาข้าวกิน"]'::jsonb),
('plan', 6, '["", "", "Arbat Street", "", "ที่พัก"]'::jsonb),
('plan', 7, '["14-ก.พ.", "09.00", "ที่พัก", "09.30", "Green Bazaar", "Yandex Go", "เดินตลาด 1.5–2 ชม. ชิมของว่าง ซื้อของฝาก · ตลาดปิดวันจันทร์ (วันนี้เปิด) · ไปเช้าคนยังน้อย"]'::jsonb),
('plan', 8, '["", "11.30", "Green Bazaar", "11.50", "28 Panfilov Guardsmen Park & Ascension Cathedral", "Yandex Go", "เดินชมสวนกับโบสถ์ราว 1 ชม."]'::jsonb),
('plan', 9, '["", "กินข้าวกลางวันแถวสวน / Zhibek Zholy (ดูแท็บ แนะนำ)"]'::jsonb),
('plan', 10, '["", "15.30", "28 Panfilov Guardsmen Park & Ascension Cathedral", "16.00", "Kok Tobe", "Yandex Go", "ซื้อตั๋วกระเช้าไป-กลับ · ขึ้นก่อนอาทิตย์ตกราว 2 ชม. · ราคา/เวลาเปิดเช็กหน้างาน"]'::jsonb),
('plan', 11, '["", "18.30", "Kok Tobe", "19.00", "Dostyk Plaza", "Yandex Go", "ข้าวเย็น + เดินห้าง (หรือเปลี่ยนเป็น Mega Center)"]'::jsonb),
('plan', 12, '["", "21.00", "Dostyk Plaza", "21.30", "ที่พัก", "Yandex Go"]'::jsonb),
('plan', 13, '["15-ก.พ.", "", "ที่พัก", "04.30", "Baytursynova St 104, Almaty 050022, Kazakhstan", "Tour Bus"]'::jsonb),
('plan', 14, '["", "1-Day Tour: Treasures of Almaty: Kaindy & Kolsai Lakes, Charyn Canyon (Ref: https://www.agoda.com/sp/FMRCyrcz8j7)"]'::jsonb),
('plan', 15, '["", "", "Baytursynova St 104, Almaty 050022, Kazakhstan", "", "ที่พัก"]'::jsonb),
('plan', 16, '["16-ก.พ.", "09.00", "ที่พัก", "10.30", "Shymbulak Ski Resort", "Yandex Go + กระเช้า", "แท็กซี่ไป Medeu (~40–60 นาที) แล้วต่อกระเช้า Medeu–Shymbulak ~20 นาที · ไปเช้าคนน้อย · เช็กเวลา/ลมก่อนขึ้น"]'::jsonb),
('plan', 17, '["", "เล่นสกี / ชมวิว / ทานข้าวบนเขา"]'::jsonb),
('plan', 18, '["", "16.00", "Shymbulak Ski Resort", "17.30", "First President Park", "Yandex Go", "เดินเล่นช่วงเย็น ก.พ. หนาว เตรียมเสื้อกันหนาว"]'::jsonb),
('plan', 19, '["", "18.45", "First President Park", "19.15", "ที่พัก", "Yandex Go", "ข้าวเย็นแถวที่พัก (ดูแท็บ แนะนำ)"]'::jsonb),
('plan', 20, '["17-ก.พ.", "", "ที่พัก", "", "Almaty Zoo", "", "Check-Out: ฝากสัมภาระไว้ที่พัก"]'::jsonb),
('plan', 21, '["", "Enjoy at Almaty Zoo"]'::jsonb),
('plan', 22, '["", "", "Almaty Zoo", "", "ที่พัก"]'::jsonb),
('plan', 23, '["", "", "ที่พัก", "21.00", "Almaty International Airport", "Yandex Go"]'::jsonb),
('plan', 24, '["18-ก.พ.", "00.20", "Almaty International Airport", "09.00", "Don Mueang International Airport", "Airplane", "XJ-865"]'::jsonb);

-- Users: 9 rows
insert into public.sheet_rows (tab, row_no, cells) values
('Users', 0, '["Name", "Budget", "PIN", "GoogleClientId"]'::jsonb),
('Users', 1, '["Nine", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 2, '["Mew", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 3, '["Tu", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 4, '["Art", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 5, '["Hud", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 6, '["Pam", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 7, '["Leo", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb),
('Users', 8, '["Boom", "", "", "659299412202-9dbo3jilqaav2afrelklur6qr6hr81bk.apps.googleusercontent.com"]'::jsonb);

-- Expenses: 21 rows
insert into public.sheet_rows (tab, row_no, cells) values
('Expenses', 0, '["Date", "Item", "Category", "Amount", "Currency", "PaidBy", "Type", "SplitWith"]'::jsonb),
('Expenses', 1, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Nine", "personal"]'::jsonb),
('Expenses', 2, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Mew", "personal"]'::jsonb),
('Expenses', 3, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Tu", "personal"]'::jsonb),
('Expenses', 4, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Art", "personal"]'::jsonb),
('Expenses', 5, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Hud", "personal"]'::jsonb),
('Expenses', 6, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "12851.53", "THB", "Pam", "personal"]'::jsonb),
('Expenses', 7, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "12851.53", "THB", "Leo", "personal"]'::jsonb),
('Expenses', 8, '["จองแล้ว", "ตั๋วเครื่องบิน BKK - ALA", "ตั๋วเครื่องบิน", "11900", "THB", "Boom", "personal"]'::jsonb),
('Expenses', 9, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Nine", "personal"]'::jsonb),
('Expenses', 10, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Mew", "personal"]'::jsonb),
('Expenses', 11, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Tu", "personal"]'::jsonb),
('Expenses', 12, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Art", "personal"]'::jsonb),
('Expenses', 13, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Hud", "personal"]'::jsonb),
('Expenses', 14, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Pam", "personal"]'::jsonb),
('Expenses', 15, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Leo", "personal"]'::jsonb),
('Expenses', 16, '["จองแล้ว", "ตั๋วเครื่องบิน ALA - DMK", "ตั๋วเครื่องบิน", "7540", "THB", "Boom", "personal"]'::jsonb),
('Expenses', 17, '["จองแล้ว", "กระเป๋าโหลด BKK - ALA (6,120 หาร 4)", "กระเป๋าโหลด", "1530", "THB", "Tu", "personal"]'::jsonb),
('Expenses', 18, '["จองแล้ว", "กระเป๋าโหลด BKK - ALA (6,120 หาร 4)", "กระเป๋าโหลด", "1530", "THB", "Nine", "personal"]'::jsonb),
('Expenses', 19, '["จองแล้ว", "กระเป๋าโหลด BKK - ALA (6,120 หาร 4)", "กระเป๋าโหลด", "1530", "THB", "Mew", "personal"]'::jsonb),
('Expenses', 20, '["จองแล้ว", "กระเป๋าโหลด BKK - ALA (6,120 หาร 4)", "กระเป๋าโหลด", "1530", "THB", "Hud", "personal"]'::jsonb);

-- Locations: 9 rows
insert into public.sheet_rows (tab, row_no, cells) values
('Locations', 0, '["Name", "Lat", "Lng", "Label", "Updated"]'::jsonb),
('Locations', 1, '["Nine"]'::jsonb),
('Locations', 2, '["Mew"]'::jsonb),
('Locations', 3, '["Tu"]'::jsonb),
('Locations', 4, '["Art"]'::jsonb),
('Locations', 5, '["Hud"]'::jsonb),
('Locations', 6, '["Pam"]'::jsonb),
('Locations', 7, '["Leo"]'::jsonb),
('Locations', 8, '["Boom"]'::jsonb);

-- Places: header only (the list starts empty; places are added in the app, which finds where they fit in the plan)
insert into public.sheet_rows (tab, row_no, cells) values
('Places', 0, '["Name", "Lat", "Lng", "Note", "Type", "Meal", "Cuisine"]'::jsonb);

-- Stay: 9 rows
insert into public.sheet_rows (tab, row_no, cells) values
('Stay', 0, '["Key", "Value"]'::jsonb),
('Stay', 1, '["Name", "Arbat-442"]'::jsonb),
('Stay', 2, '["Platform", "Airbnb"]'::jsonb),
('Stay', 3, '["Address", "Nauryzbai Batyr Street 50 442, 15, 7, Almaty, Almaty Region 050000, Kazakhstan"]'::jsonb),
('Stay', 4, '["Lat", "43.260721"]'::jsonb),
('Stay', 5, '["Lng", "76.9358"]'::jsonb),
('Stay', 6, '["CheckIn", "เช็คอินแบบรีโมทด้วยกุญแจอิเล็กทรอนิกส์ — เจ้าของจะส่งรหัสส่วนตัวและวิธีเข้าพักทางข้อความ \"ในวันที่เดินทางถึง\" หลังแขกก่อนหน้าเช็คเอาต์ ให้รอข้อความในวันนั้น"]'::jsonb),
('Stay', 7, '["Rules", "ของใช้: มีชุดเริ่มต้นต่อการเช็คอิน (กระดาษชำระ สบู่ แชมพู น้ำยาล้างจาน ฟองน้ำ ถุงขยะ) ไม่มีเติมให้\nห้ามสูบบุหรี่ ทั้งในห้อง ระเบียง ทางเข้า ลิฟต์ และพื้นที่ส่วนกลาง (สูบได้เฉพาะจุดที่กำหนดในโครงการ)\nเงียบหลัง 22:00 ถึง 09:00 ห้ามจัดปาร์ตี้หรือส่งเสียงรบกวนเพื่อนบ้าน\nห้ามสารเสพติด ห้ามให้บริการทางเพศ ห้ามกิจกรรมผิดกฎหมาย/ผิดกฎโครงการ/ผิดกฎ Airbnb\nขยะ: ทิ้งทุกวัน จุดทิ้งขยะอยู่บน Google Maps (ขอพิกัดจากเจ้าของได้)\nผ้าขนหนูขาวใช้เช็ดตัวหลังอาบน้ำเท่านั้น (ห้ามเช็ดรองเท้า/เครื่องสำอาง/ย้อมผม) ผ้าปูไว้นอนเท่านั้น คราบหนักอาจโดนค่าซักแห้ง\nรักษาความสะอาดทางเข้า ลิฟต์ และพื้นที่ส่วนกลางของโครงการ\nสำคัญ: ฝ่าฝืนกฎอาจถูกแจ้ง Airbnb หักเงินค่าเสียหาย ค่าทำความสะอาด หรือซักแห้ง"]'::jsonb),
('Stay', 8, '["Note", "พิกัดอ้างอิงอาคาร ЖК Арбат (OpenStreetMap) — ตรวจกับ Google Maps อีกครั้ง · ห้ามใส่รหัสเข้าห้องในแท็บนี้ (ใครมีลิงก์ชีตอ่านได้)"]'::jsonb);

-- (no Tips tab any more: the app has no built-in or suggested places)
