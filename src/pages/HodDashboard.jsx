import React, { useState, useEffect, useCallback, useMemo } from "react";
import ReactDOM, { createPortal } from "react-dom";
import {
  Users,
  BookOpen,
  Link,
  Settings,
  Upload,
  Trash2,
  Activity,
  Search,
  FileText,
  Printer,
  PieChart,
  BarChart,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Library,
  Edit2,
  Filter,
  X,
  RefreshCw,
  ArrowUpCircle,
  Building2,
} from "lucide-react";
import CustomSelect from "../components/UI/CustomSelect";
import { Card } from "../components/UI";
import DonutChart from "../components/DonutChart";
import QuestionDonutChart from "../components/QuestionDonutChart";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  FEEDBACK_QUESTIONS,
  INSTITUTION_QUESTIONS,
} from "../constants/feedbackQuestions";
import {
  isValidRollNumber,
  normalizeRollDigits,
  ROLL_NUMBER_HINT,
  rollFromSpreadsheetCell,
} from "../constants/rollNumber";
import { useNotify } from "../context/NotificationContext.jsx";
// Removed hardcoded MSBTE import

export default function HodDashboard({ user }) {
  const { success, error: notifyError, warning } = useNotify();
  const [activeTab, setActiveTab] = useState("students");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRemainingModal, setShowRemainingModal] = useState(false);
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);

  // -- Data States --
  const [subjectList, setSubjectList] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]); // NEW: Store Feedbacks
  const [allocations, setAllocations] = useState([]); // NEW: Store Allocations
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(false);

  // -- Form States --
  const [excelClass, setExcelClass] = useState("");
  const [excelDiv, setExcelDiv] = useState("");

  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editSubjectForm, setEditSubjectForm] = useState({
    name: "",
    code: "",
    semester: "",
    isElective: false,
  });
  const [stdForm, setStdForm] = useState({
    name: "",
    roll: "",
    enroll: "",
    email: "",
    div: "",
    tClass: "",
  });
  const [subForm, setSubForm] = useState({
    name: "",
    code: "",
    semester: "",
    isElective: false,
  });
  const [subjectSemesterFilter, setSubjectSemesterFilter] = useState("");
  const [allotForm, setAllotForm] = useState({
    staffDept: user.dept,
    staff: "",
    subject: "",
    tClass: "",
    division: "",
  });

  const [departmentsList, setDepartmentsList] = useState([]);
  const [allDepartmentsData, setAllDepartmentsData] = useState([]);
  const [allStaffList, setAllStaffList] = useState([]);
  const [allSubjectList, setAllSubjectList] = useState([]);
  const [schemeMappings, setSchemeMappings] = useState({
    year1: "",
    year2: "",
    year3: "",
  });

  // -- Monitor & Report States (NEW) --
  const [monitorDept, setMonitorDept] = useState(user.dept || "");
  const [monitorStaff, setMonitorStaff] = useState("");
  const [monitorSubject, setMonitorSubject] = useState("");
  const [reportDept, setReportDept] = useState(user.dept || "");
  const [reportStaff, setReportStaff] = useState("");
  const [reportSubject, setReportSubject] = useState("");
  const [acadYear, setAcadYear] = useState("");
  const [semester, setSemester] = useState("");
  const [dynamicClassOptions, setDynamicClassOptions] = useState([]);

  // -- Course Exit Survey States --
  const [reportMode, setReportMode] = useState("faculty"); // "faculty" | "exit" | "institution"
  const [exitResponses, setExitResponses] = useState([]);
  const [exitForms, setExitForms] = useState([]);

  // -- Directory Filter & Edit States --
  const [searchRollNo, setSearchRollNo] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    roll: "",
    enroll: "",
    email: "",
    tClass: "",
    div: "",
  });

  // -- Student Lifecycle States --
  const [resetClassTarget, setResetClassTarget] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [allotmentToDelete, setAllotmentToDelete] = useState(null); // { id, staff, subject }
  const [editingAllotmentId, setEditingAllotmentId] = useState(null);
  const [resetCandidates, setResetCandidates] = useState([]);
  const [excludedFromReset, setExcludedFromReset] = useState(new Set());
  const lifecycleStorageKey = `hod:lifecycleProgress:${user.dept || "unknown"}`;
  const [workflowProgress, setWorkflowProgress] = useState(() => {
    try {
      const raw = localStorage.getItem(lifecycleStorageKey);
      if (!raw) return { cleanup3Done: false, promote23Done: false };
      const parsed = JSON.parse(raw);
      return {
        cleanup3Done: parsed?.cleanup3Done === true,
        promote23Done: parsed?.promote23Done === true,
      };
    } catch {
      return { cleanup3Done: false, promote23Done: false };
    }
  });
  const [detainedRollInput, setDetainedRollInput] = useState("");
  const [detainedInputErrors, setDetainedInputErrors] = useState({
    invalid: [],
    notFound: [],
  });
  const [detainedInputModal, setDetainedInputModal] = useState({
    open: false,
    action: "", // cleanup3 | promote23 | promote12
    title: "",
    message: "",
    sourceClass: "",
    targetClass: "",
    candidates: [],
  });
  const [detainedConfirmModal, setDetainedConfirmModal] = useState({
    open: false,
    action: "",
    title: "",
    candidates: [],
    detainedStudents: [],
    processableStudents: [],
    sourceClass: "",
    targetClass: "",
    duplicateCount: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      setStudentsLoaded(false);
      const allDeptsQ = query(collection(db, "Departments"));
      const allDeptsSnap = await getDocs(allDeptsQ);
      const deptsData = allDeptsSnap.docs.map((d) => d.data());
      setAllDepartmentsData(deptsData);
      setDepartmentsList(deptsData.map((d) => d.name));

      const allStaffQ = query(
        collection(db, "Users"),
        where("role", "in", ["staff", "hod"]),
      );
      const allStaffSnap = await getDocs(allStaffQ);
      const activeStaff = allStaffSnap.docs
        .map((d) => d.data())
        .filter((u) => u.active !== false);

      setAllStaffList(activeStaff);

      const allSubQ = query(collection(db, "Subjects"));
      const allSubSnap = await getDocs(allSubQ);
      const fetchedAllSubjects = allSubSnap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      }));
      setAllSubjectList(fetchedAllSubjects);
      setSubjectList(
        fetchedAllSubjects.filter((s) => s.department === user.dept),
      );

      const stdQ = query(
        collection(db, "Students"),
        // Removed department filter to ensure we can find students for division matching
      );
      const stdSnap = await getDocs(stdQ);
      const allFetchedStudents = stdSnap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      }));

      // Filter in memory for the directory tab
      setStudents(allFetchedStudents.filter((s) => s.department === user.dept));
      setStudentsLoaded(true);

      // Fetch Feedbacks for Monitor & Reports — scoped to this department's staff
      const deptStaffNames = activeStaff
        .filter((s) => s.dept === user.dept)
        .map((s) => s.name);

      const feedQ = deptStaffNames.length > 0
        ? query(
            collection(db, "Feedbacks"),
            where("staffName", "in", deptStaffNames.slice(0, 30)),
          )
        : query(
            collection(db, "Feedbacks"),
            where("department", "==", user.dept),
          );
      const feedSnap = await getDocs(feedQ);
      const allFetchedFeedbacks = feedSnap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      }));

      // Filter in memory to only include feedbacks for this department or its staff
      const fetchedFeedbacks = allFetchedFeedbacks
        .filter((f) => {
          if (f.department === user.dept) return true;
          const staffObj = activeStaff.find((s) => s.name === f.staffName);
          return staffObj && staffObj.dept === user.dept;
        })
        .sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());

      setFeedbacks(fetchedFeedbacks);
      // Fetch Course Exit Data
      const exitFormsQ = query(
        collection(db, "CourseExitForms"),
        where("department", "==", user.dept),
      );
      const exitFormsSnap = await getDocs(exitFormsQ);
      setExitForms(exitFormsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const exitRespQ = query(
        collection(db, "CourseExitResponses"),
        where("department", "==", user.dept),
      );
      const exitRespSnap = await getDocs(exitRespQ);
      setExitResponses(
        exitRespSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      );

      // Fetch Allocations
      const allocQ = query(
        collection(db, "Allocations"),
        where("department", "==", user.dept),
      );
      const allocSnap = await getDocs(allocQ);
      const fetchedAllocations = allocSnap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      }));
      setAllocations(fetchedAllocations);

      const setSnap = await getDoc(doc(db, "Settings", "Global"));
      if (setSnap.exists()) {
        setIsPortalOpen(setSnap.data().studentPortalOpen === true);
        setIsStaffPortalOpen(setSnap.data().staffPortalOpen === true);
      }

      // --- DYNAMIC SCHEME GENERATION ---
      const mapSnap = await getDoc(doc(db, "Settings", "SchemeMapping"));
      const sMap = mapSnap.exists()
        ? mapSnap.data()
        : { year1: "K-Scheme", year2: "K-Scheme", year3: "K-Scheme" };
      setSchemeMappings(sMap);
      const formatScheme = (val) => {
        if (!val) return "K-Scheme";
        const str = String(val).trim();
        if (str.toLowerCase().includes("scheme")) return str;
        return `${str}-Scheme`;
      };

      const y1 = formatScheme(sMap.year1);
      const y2 = formatScheme(sMap.year2);
      const y3 = formatScheme(sMap.year3);

      const extractL = (s) =>
        s ? String(s).trim().charAt(0).toUpperCase() : "K";
      const l1 = extractL(sMap.year1);
      const l2 = extractL(sMap.year2);
      const l3 = extractL(sMap.year3);

      const deptCodeTarget = !allDeptsSnap.empty
        ? deptsData.find((d) => d.name === user.dept)?.code || "XX"
        : "XX";

      setDynamicClassOptions([
        {
          group: `1st Year - ${y1}`,
          options: [
            {
              value: `1Y${deptCodeTarget}${l1}`,
              label: `1st Year (${deptCodeTarget}) - ${y1}`,
            },
          ],
        },
        {
          group: `2nd Year - ${y2}`,
          options: [
            {
              value: `2Y${deptCodeTarget}${l2}`,
              label: `2nd Year (${deptCodeTarget}) - ${y2}`,
            },
          ],
        },
        {
          group: `3rd Year - ${y3}`,
          options: [
            {
              value: `3Y${deptCodeTarget}${l3}`,
              label: `3rd Year (${deptCodeTarget}) - ${y3}`,
            },
          ],
        },
      ]);
    } catch (err) {
      console.error(err);
      setStudentsLoaded(true);
    }
  }, [user.dept]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData();
    });
  }, [fetchData]);

  useEffect(() => {
    if (reportSubject) {
      const formatRoman = (val) => {
        if (!val) return "";
        const s = String(val).toUpperCase();
        const match = s.match(/\d/);
        if (match) {
          const num = parseInt(match[0]);
          if (num >= 1 && num <= 6)
            return ["", "I", "II", "III", "IV", "V", "VI"][num];
        }
        if (s.includes("VI")) return "VI";
        if (s.includes("IV")) return "IV";
        if (s.includes("V")) return "V";
        if (s.includes("III")) return "III";
        if (s.includes("II")) return "II";
        if (s.includes("I")) return "I";
        return val;
      };

      const fbMatch = feedbacks.find(
        (f) => f.subject === reportSubject && f.semester,
      );
      if (fbMatch && fbMatch.semester) {
        setSemester(formatRoman(fbMatch.semester));
        return;
      }
      const allocMatch = allocations.find(
        (a) => a.subject === reportSubject && a.semester,
      );
      if (allocMatch && allocMatch.semester) {
        setSemester(formatRoman(allocMatch.semester));
      }
    }
  }, [reportSubject, feedbacks, allocations]);

  // Dynamic Options replaced static MSBTE_CLASS_OPTIONS

  const handleManualStudent = async (e) => {
    e.preventDefault();
    const rollNorm = normalizeRollDigits(stdForm.roll);
    if (!isValidRollNumber(rollNorm)) {
      warning(ROLL_NUMBER_HINT);
      return;
    }
    const emailTrim = stdForm.email.trim();
    if (!emailTrim) {
      warning(
        "Student email is required — OTP login sends the code to this address.",
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      warning("Enter a valid email address.");
      return;
    }
    try {
      await addDoc(collection(db, "Students"), {
        name: stdForm.name.trim(),
        rollNo: rollNorm,
        enrollmentNo: stdForm.enroll.trim(),
        email: emailTrim,
        division: stdForm.div || "A",
        targetClass: stdForm.tClass,
        department: user.dept,
        status: "pending",
        isClaimed: false,
      });
      setStdForm({
        name: "",
        roll: "",
        enroll: "",
        email: "",
        div: "",
        tClass: "",
      });
      fetchData();
      success("Student saved.");
    } catch {
      notifyError("Failed to save student.");
    }
  };

  const handleExcelUpload = async (e) => {
    // YOUR ROBUST EXCEL PARSER (KEPT INTACT)
    const file = e.target.files[0];
    if (!file) return;
    setIsSubmitting(true);
    // Lazy-load xlsx only when needed — it's ~500KB
    const XLSX = await import("xlsx");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const rawRows = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1 },
      );
      let headerIdx = -1,
        nameCols = [],
        rollCol = -1,
        enrollCol = -1,
        emailCol = -1;
      for (let i = 0; i < Math.min(20, rawRows.length); i++) {
        const row = rawRows[i];
        if (!row || row.length < 2) continue;
        const s = row.join(" ").toLowerCase().replace(/\s/g, "");
        if (s.includes("name") && (s.includes("roll") || s.includes("rno"))) {
          headerIdx = i;
          row.forEach((cell, idx) => {
            const c = String(cell || "")
              .toLowerCase()
              .replace(/\s/g, "");
            if (c.includes("name")) nameCols.push(idx);
            if (c.includes("roll") || c.includes("rno")) rollCol = idx;
            if (c.includes("enroll") || c.includes("prn")) enrollCol = idx;
            if (c.includes("email")) emailCol = idx;
          });
          break;
        }
      }
      if (headerIdx === -1) {
        notifyError(
          "Could not find a header row with Name and Roll/R.No columns. Check your Excel layout.",
        );
        setIsSubmitting(false);
        return;
      }
      if (emailCol === -1) {
        notifyError(
          'Add an "Email" column to your sheet. Students need it to receive OTP codes when logging in.',
        );
        setIsSubmitting(false);
        return;
      }
      const promises = [];
      let skippedRoll = 0;
      let skippedEmail = 0;
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (!r || !r[enrollCol]) continue;
        const rollNo = rollFromSpreadsheetCell(r[rollCol]);
        if (!isValidRollNumber(rollNo)) {
          skippedRoll++;
          continue;
        }
        const emailStr = String(r[emailCol] || "").trim();
        if (!emailStr) {
          skippedEmail++;
          continue;
        }
        promises.push(
          addDoc(collection(db, "Students"), {
            department: user.dept,
            name: nameCols.map((idx) => String(r[idx] || "").trim()).join(" "),
            rollNo,
            enrollmentNo: String(r[enrollCol] || "").trim(),
            email: emailStr,
            division: excelDiv || "A",
            targetClass: excelClass,
            status: "pending",
            isClaimed: false,
          }),
        );
      }
      await Promise.all(promises);
      const skipMsg = [
        skippedRoll
          ? `${skippedRoll} row(s) skipped (invalid roll — use 15xx / 25xx / 35xx).`
          : "",
        skippedEmail ? `${skippedEmail} row(s) skipped (empty email).` : "",
      ]
        .filter(Boolean)
        .join(" ");
      success(
        `Imported ${promises.length} student(s) into ${excelClass} (Div ${excelDiv}).${skipMsg ? ` ${skipMsg}` : ""}`,
      );
      fetchData();
    } catch {
      notifyError(
        "Excel processing failed. Check the file format and try again.",
      );
    }
    setIsSubmitting(false);
  };

  const dynamicClassOptionsForAllotment = React.useMemo(() => {
    const sMap = schemeMappings;
    const formatScheme = (val) => {
      if (!val) return "K-Scheme";
      const str = String(val).trim();
      if (str.toLowerCase().includes("scheme")) return str;
      return `${str}-Scheme`;
    };
    const y1 = formatScheme(sMap.year1);
    const y2 = formatScheme(sMap.year2);
    const y3 = formatScheme(sMap.year3);

    const extractL = (s) =>
      s ? String(s).trim().charAt(0).toUpperCase() : "K";
    const l1 = extractL(sMap.year1);
    const l2 = extractL(sMap.year2);
    const l3 = extractL(sMap.year3);

    const deptCodeTarget =
      allDepartmentsData.find(
        (d) => d.name === (allotForm.staffDept || user.dept),
      )?.code || "XX";

    const semesterGroups = [
      { group: `Semesters 1 & 2 - ${y1}`, schemeLetter: l1, semesters: [1, 2] },
      { group: `Semesters 3 & 4 - ${y2}`, schemeLetter: l2, semesters: [3, 4] },
      { group: `Semesters 5 & 6 - ${y3}`, schemeLetter: l3, semesters: [5, 6] },
    ];

    return semesterGroups.map((semGroup) => ({
      group: semGroup.group,
      options: semGroup.semesters.map((semNo) => {
        const semesterCode = `${deptCodeTarget}${semNo}${semGroup.schemeLetter}`;
        return {
          value: semesterCode,
          label: `Semester ${semNo} (${semesterCode})`,
        };
      }),
    }));
  }, [allotForm.staffDept, user.dept, allDepartmentsData, schemeMappings]);

  const extractSemesterNumber = (classCode) => {
    const match = String(classCode || "")
      .trim()
      .match(/([1-6])/);
    return match ? match[1] : "";
  };

  const semesterOptionMeta = React.useMemo(() => {
    const deptCode =
      allDepartmentsData.find((d) => d.name === user.dept)?.code || "XX";
    const extractL = (s) =>
      s ? String(s).trim().charAt(0).toUpperCase() : "K";
    const l1 = extractL(schemeMappings.year1);
    const l2 = extractL(schemeMappings.year2);
    const l3 = extractL(schemeMappings.year3);

    const semCodeByNumber = {
      1: `${deptCode}1${l1}`,
      2: `${deptCode}2${l1}`,
      3: `${deptCode}3${l2}`,
      4: `${deptCode}4${l2}`,
      5: `${deptCode}5${l3}`,
      6: `${deptCode}6${l3}`,
    };

    return [1, 2, 3, 4, 5, 6].map((semNo) => ({
      value: String(semNo),
      code: semCodeByNumber[semNo],
      schemeLabel: semNo <= 2 ? l1 : semNo <= 4 ? l2 : l3,
    }));
  }, [allDepartmentsData, user.dept, schemeMappings]);

  const semesterSelectOptions = React.useMemo(
    () =>
      semesterOptionMeta.map((sem) => ({
        value: sem.value,
        label: `Semester ${sem.value} (${sem.code})`,
      })),
    [semesterOptionMeta],
  );

  const groupedSemesterSelectOptions = React.useMemo(() => {
    const [s1, s2, s3, s4, s5, s6] = semesterOptionMeta;
    return [
      {
        group: `Semesters 1 & 2 - ${s1?.schemeLabel || "K"}-Scheme`,
        options: [s1, s2].filter(Boolean).map((s) => ({
          value: s.value,
          label: `Semester ${s.value} (${s.code})`,
        })),
      },
      {
        group: `Semesters 3 & 4 - ${s3?.schemeLabel || "K"}-Scheme`,
        options: [s3, s4].filter(Boolean).map((s) => ({
          value: s.value,
          label: `Semester ${s.value} (${s.code})`,
        })),
      },
      {
        group: `Semesters 5 & 6 - ${s5?.schemeLabel || "K"}-Scheme`,
        options: [s5, s6].filter(Boolean).map((s) => ({
          value: s.value,
          label: `Semester ${s.value} (${s.code})`,
        })),
      },
    ];
  }, [semesterOptionMeta]);

  const handleAllotment = async (e) => {
    e.preventDefault();
    if (!allotForm.staff || !allotForm.subject || !allotForm.tClass) {
      warning("Please select faculty, subject, and class before confirming.");
      return;
    }
    try {
      const selectedSubjectData = allSubjectList.find(
        (s) =>
          s.name === allotForm.subject &&
          s.department === (allotForm.staffDept || user.dept),
      );
      const selectedClassSemester = extractSemesterNumber(allotForm.tClass);
      if (
        selectedClassSemester &&
        selectedSubjectData?.semester &&
        selectedSubjectData.semester !== selectedClassSemester
      ) {
        warning(
          `Selected subject is for Semester ${selectedSubjectData.semester}. Please select a Semester ${selectedSubjectData.semester} class.`,
        );
        return;
      }
      const isElective = selectedSubjectData?.isElective || false;
      const payload = {
        staff: allotForm.staff,
        subject: allotForm.subject,
        tClass: allotForm.tClass,
        targetClass: allotForm.tClass,
        division: allotForm.division,
        department: allotForm.staffDept || user.dept,
        semester: selectedSubjectData?.semester || "",
        isElective: isElective,
      };

      if (editingAllotmentId) {
        await updateDoc(doc(db, "Allocations", editingAllotmentId), payload);
        setEditingAllotmentId(null);
        success("Allotment updated.");
      } else {
        await addDoc(collection(db, "Allocations"), {
          ...payload,
          createdAt: new Date(),
        });
        success("Academic allotment confirmed.");
      }

      setAllotForm({
        staffDept: user.dept,
        staff: "",
        subject: "",
        tClass: "",
        division: "",
      });
      fetchData();
    } catch {
      notifyError(
        editingAllotmentId
          ? "Failed to update allotment."
          : "Failed to allot faculty.",
      );
    }
  };

  const handleEditAllotment = (alloc) => {
    setEditingAllotmentId(alloc.id);
    setAllotForm({
      staffDept: alloc.department || user.dept,
      staff: alloc.staff || "",
      subject: alloc.subject || "",
      tClass: alloc.targetClass || alloc.tClass || "",
      division: alloc.division || "",
    });
  };

  const handleCancelEditAllotment = () => {
    setEditingAllotmentId(null);
    setAllotForm({
      staffDept: user.dept,
      staff: "",
      subject: "",
      tClass: "",
      division: "",
    });
  };

  const handleDeleteAllocation = async () => {
    if (!allotmentToDelete) return;

    try {
      await deleteDoc(doc(db, "Allocations", allotmentToDelete.id));
      success("Allotment removed.");
      setAllotmentToDelete(null);
      fetchData();
    } catch (err) {
      console.error(err);
      notifyError("Failed to remove allotment.");
    }
  };

  // --- REPORT ENGINE CALCULATIONS ---
  const monitorStaffOptions = useMemo(() => {
    const staffNamesWithDepts = allStaffList.map((s) => ({
      name: s.name,
      dept: s.dept,
    }));

    feedbacks.forEach((f) => {
      if (!staffNamesWithDepts.find((s) => s.name === f.staffName)) {
        staffNamesWithDepts.push({ name: f.staffName, dept: "Unknown" });
      }
    });

    let filtered = staffNamesWithDepts;
    if (monitorDept) {
      filtered = filtered.filter((s) => s.dept === monitorDept);
    }

    return filtered.map((s) => ({ value: s.name, label: s.name }));
  }, [allStaffList, feedbacks, monitorDept]);

  const monitorSubjectOptions = useMemo(() => {
    if (!monitorStaff) return [];
    const subjects = [
      ...new Set(
        feedbacks
          .filter((f) => f.staffName === monitorStaff)
          .map((f) => f.subject),
      ),
    ];
    return subjects.map((s) => ({ value: s, label: s }));
  }, [feedbacks, monitorStaff]);

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      // 1. Department Filter
      if (monitorDept) {
        const staffObj = allStaffList.find((s) => s.name === f.staffName);
        const isDeptMatch =
          f.department === monitorDept ||
          (staffObj && staffObj.dept === monitorDept);

        if (!isDeptMatch) return false;
      }
      // 2. Staff Filter
      if (monitorStaff && f.staffName !== monitorStaff) return false;
      // 2.5 Subject Filter
      if (monitorSubject && f.subject !== monitorSubject) return false;
      return true;
    });
  }, [feedbacks, monitorDept, monitorStaff, monitorSubject, allStaffList]);

  const activeDataSource = reportMode === "exit" ? exitResponses : feedbacks;

  const reportData = useMemo(() => {
    return activeDataSource.filter((f) => {
      return (
        f.staffName === reportStaff &&
        (reportSubject === "" || f.subject === reportSubject)
      );
    });
  }, [activeDataSource, reportStaff, reportSubject]);

  const totalStudents = reportData.length;

  // Calculate total students in class, submitted, and remaining
  const allocation = useMemo(() => {
    return reportSubject
      ? allocations.find(
          (a) => a.staff === reportStaff && a.subject === reportSubject,
        )
      : null;
  }, [allocations, reportStaff, reportSubject]);

  const studentsInClass = useMemo(() => {
    return allocation
      ? students.filter((s) => {
          const matchClass =
            s.targetClass === (allocation.targetClass || allocation.tClass);
          const matchDiv =
            allocation.division === "All"
              ? true
              : (s.division || "A") === allocation.division;
          return matchClass && matchDiv;
        })
      : [];
  }, [allocation, students]);

  const totalStudentsInClass = studentsInClass.length;

  const submittedStudentNames = useMemo(
    () => new Set(reportData.map((f) => f.studentName)),
    [reportData],
  );
  const submittedStudents = submittedStudentNames.size;
  const remainingStudentsList = useMemo(
    () => studentsInClass.filter((s) => !submittedStudentNames.has(s.name)),
    [studentsInClass, submittedStudentNames],
  );
  const remainingStudents = remainingStudentsList.length;

  const submittedStudentsList = useMemo(
    () => studentsInClass.filter((s) => submittedStudentNames.has(s.name)),
    [studentsInClass, submittedStudentNames],
  );

  const filteredStudents = useMemo(() => {
    if (!searchRollNo && !filterClass && !filterDivision) return [];
    // Keep directory queries scoped: if a class is selected, division must also be selected.
    if (filterClass && !filterDivision) return [];
    return students.filter((s) => {
      const matchSearch =
        !searchRollNo ||
        s.name?.toLowerCase().includes(searchRollNo.toLowerCase()) ||
        s.rollNo?.toLowerCase().includes(searchRollNo.toLowerCase()) ||
        s.prn?.toLowerCase().includes(searchRollNo.toLowerCase()) ||
        s.enrollmentNo?.toLowerCase().includes(searchRollNo.toLowerCase());
      const matchClass = !filterClass || s.targetClass === filterClass;
      const normalizedStudentDiv = String(s.division || "A")
        .trim()
        .toUpperCase();
      const normalizedFilterDiv = String(filterDivision || "")
        .trim()
        .toUpperCase();
      const matchDiv =
        !normalizedFilterDiv || normalizedStudentDiv === normalizedFilterDiv;
      return matchSearch && matchClass && matchDiv;
    });
  }, [students, searchRollNo, filterClass, filterDivision]);

  // For Exit Surveys, we need the specific form to get the custom questions array
  const activeExitForm =
    reportMode === "exit" && reportSubject
      ? exitForms.find(
          (f) => f.staffName === reportStaff && f.subject === reportSubject,
        )
      : null;

  const activeQuestions =
    reportMode === "exit"
      ? activeExitForm?.questions || []
      : FEEDBACK_QUESTIONS;

  const qCount = activeQuestions.length;

  const scoreCounts = Array.from({ length: qCount }, () => ({
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  }));
  if (totalStudents > 0) {
    reportData.forEach((fb) => {
      Object.keys(fb.scores).forEach((qIndex) => {
        const rating = parseInt(fb.scores[qIndex]);
        if (scoreCounts[qIndex] && scoreCounts[qIndex][rating] !== undefined)
          scoreCounts[qIndex][rating]++;
      });
    });
  }

  const colTotals = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const colScores = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let grandTotalScore = 0;

  for (let i = 0; i < qCount; i++) {
    [5, 4, 3, 2, 1].forEach((rating) => {
      colTotals[rating] += scoreCounts[i][rating];
      colScores[rating] += scoreCounts[i][rating] * rating;
      grandTotalScore += scoreCounts[i][rating] * rating;
    });
  }

  const maxPossibleScore = totalStudents * qCount * 5;
  const marksOutOf25 =
    maxPossibleScore > 0
      ? ((grandTotalScore / maxPossibleScore) * 25).toFixed(2)
      : "0.00";
  const overallAverageOutOf5 =
    maxPossibleScore > 0
      ? Math.round((grandTotalScore / maxPossibleScore) * 5)
      : "0";

  const staffSubjects = [
    ...new Set(
      [...feedbacks, ...exitForms]
        .filter((f) => f.staffName === reportStaff)
        .map((f) => f.subject),
    ),
  ];

  // --- STUDENT LIFECYCLE HANDLERS ---
  const openDetainedInputModal = ({
    action,
    title,
    message,
    sourceClass = "",
    targetClass = "",
    candidates = [],
  }) => {
    setDetainedRollInput("");
    setDetainedInputErrors({ invalid: [], notFound: [] });
    setDetainedInputModal({
      open: true,
      action,
      title,
      message,
      sourceClass,
      targetClass,
      candidates,
    });
  };

  const closeDetainedFlow = () => {
    setDetainedInputModal({
      open: false,
      action: "",
      title: "",
      message: "",
      sourceClass: "",
      targetClass: "",
      candidates: [],
    });
    setDetainedConfirmModal({
      open: false,
      action: "",
      title: "",
      candidates: [],
      detainedStudents: [],
      processableStudents: [],
      sourceClass: "",
      targetClass: "",
      duplicateCount: 0,
    });
    setDetainedRollInput("");
    setDetainedInputErrors({ invalid: [], notFound: [] });
  };

  const proceedWithDetainedRolls = () => {
    const tokensRaw = String(detainedRollInput || "")
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean);

    const normalizedTokens = tokensRaw.map((r) => normalizeRollDigits(r));
    const uniqueRolls = [...new Set(normalizedTokens)];
    const duplicateCount = Math.max(
      0,
      normalizedTokens.length - uniqueRolls.length,
    );

    const invalid = uniqueRolls.filter((r) => !isValidRollNumber(r));
    const candidateByRoll = new Map(
      detainedInputModal.candidates.map((s) => [
        normalizeRollDigits(String(s.rollNo || "")),
        s,
      ]),
    );
    const notFound = uniqueRolls.filter(
      (r) => isValidRollNumber(r) && !candidateByRoll.has(r),
    );

    if (invalid.length || notFound.length) {
      setDetainedInputErrors({ invalid, notFound });
      return;
    }

    const detainedStudents = uniqueRolls
      .map((r) => candidateByRoll.get(r))
      .filter(Boolean);
    const detainedIds = new Set(detainedStudents.map((s) => s.id));
    const processableStudents = detainedInputModal.candidates.filter(
      (s) => !detainedIds.has(s.id),
    );

    setDetainedInputErrors({ invalid: [], notFound: [] });
    setDetainedInputModal((prev) => ({ ...prev, open: false }));
    setDetainedConfirmModal({
      open: true,
      action: detainedInputModal.action,
      title:
        detainedInputModal.action === "cleanup3"
          ? "Confirm 3rd Year Cleanup"
          : detainedInputModal.action === "promote23"
            ? "Confirm Promotion (2nd -> 3rd)"
            : "Confirm Promotion (1st -> 2nd)",
      candidates: detainedInputModal.candidates,
      detainedStudents,
      processableStudents,
      sourceClass: detainedInputModal.sourceClass,
      targetClass: detainedInputModal.targetClass,
      duplicateCount,
    });
  };

  const executeDetainedAction = async () => {
    const {
      action,
      processableStudents,
      detainedStudents,
      targetClass,
      sourceClass,
    } = detainedConfirmModal;

    if (
      action !== "cleanup3" &&
      action !== "promote23" &&
      action !== "promote12"
    ) {
      warning("Invalid lifecycle action.");
      return;
    }

    if (processableStudents.length === 0) {
      warning(
        action === "cleanup3"
          ? "No students selected for cleanup."
          : "No students selected for promotion.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      if (action === "cleanup3") {
        processableStudents.forEach((std) => {
          batch.delete(doc(db, "Students", std.id));
        });
        await batch.commit();
        success(
          `Cleared ${processableStudents.length} student(s). ${detainedStudents.length} detained student(s) remained in 3rd year.`,
        );
        setWorkflowProgress({
          cleanup3Done: true,
          promote23Done: false,
        });
      } else {
        processableStudents.forEach((std) => {
          const docRef = doc(db, "Students", std.id);
          const targetYearNum = getYearFromClassCode(targetClass);

          let newRollNo = std.rollNo;
          if (newRollNo) {
            const rollStr = String(newRollNo);
            if (targetYearNum === 2 && rollStr.startsWith("1")) {
              newRollNo = "2" + rollStr.substring(1);
            } else if (targetYearNum === 3 && rollStr.startsWith("2")) {
              newRollNo = "3" + rollStr.substring(1);
            }
          }

          batch.update(docRef, {
            targetClass,
            rollNo: newRollNo,
            status: "pending",
          });
        });
        await batch.commit();

        success(
          `Promoted ${processableStudents.length} student(s) from ${sourceClass} to ${targetClass}. ${detainedStudents.length} detained student(s) stayed back.`,
        );

        if (action === "promote23") {
          setWorkflowProgress((prev) => ({
            ...prev,
            promote23Done: true,
          }));
        }
        if (action === "promote12") {
          setWorkflowProgress({
            cleanup3Done: false,
            promote23Done: false,
          });
        }
      }

      closeDetainedFlow();
      fetchData();
    } catch (err) {
      console.error(err);
      notifyError(
        action === "cleanup3"
          ? "3rd year cleanup failed."
          : "Promotion failed. Please try again.",
      );
    }
    setIsSubmitting(false);
  };

  const getPrimaryClassCodeForYear = (yearNum) => {
    const allOptions = dynamicClassOptions.flatMap((g) => g.options || []);
    const matched = allOptions.find(
      (opt) => getYearFromClassCode(opt.value) === yearNum,
    );
    return matched?.value || "";
  };

  const processBulkPromote = async (sourceClass, targetClass) => {
    if (!sourceClass || !targetClass) {
      warning("Please select both source and target classes.");
      return;
    }
    if (sourceClass === targetClass) {
      warning("Source and target classes cannot be the same.");
      return;
    }

    // Restrict promotion to strictly consecutive years
    const sourceYear = getYearFromClassCode(sourceClass);
    const targetYearNum = getYearFromClassCode(targetClass);

    if (sourceYear !== null && targetYearNum !== null) {
      if (targetYearNum !== sourceYear + 1) {
        warning(
          `Invalid promotion rule: You must promote students exactly one year forward. Jumping from Year ${sourceYear} to Year ${targetYearNum} is not allowed!`,
        );
        return;
      }
    }

    if (
      sourceYear === 2 &&
      targetYearNum === 3 &&
      thirdYearStudentsCount > 0 &&
      !workflowProgress.cleanup3Done
    ) {
      warning(
        "Step 2 is locked. Complete Step 1 (Clear Outgoing 3rd Year) first.",
      );
      return;
    }

    if (
      sourceYear === 1 &&
      targetYearNum === 2 &&
      !workflowProgress.promote23Done
    ) {
      warning("Step 3 is locked. Complete Step 2 (Promote 2nd to 3rd) first.");
      return;
    }

    const studentsToPromote = students.filter(
      (s) => s.targetClass === sourceClass,
    );
    if (studentsToPromote.length === 0) {
      if (sourceYear === 2 && targetYearNum === 3) {
        setWorkflowProgress((prev) => ({
          ...prev,
          promote23Done: true,
        }));
        return;
      }
      warning(`No students found in ${sourceClass}.`);
      return;
    }

    openDetainedInputModal({
      action: sourceYear === 2 ? "promote23" : "promote12",
      title:
        sourceYear === 2
          ? "Step 2: Promote 2nd Year to 3rd Year"
          : "Step 3: Promote 1st Year to 2nd Year",
      message:
        "Enter detained student roll numbers separated by commas or spaces. These students will stay in the current year.",
      sourceClass,
      targetClass,
      candidates: studentsToPromote,
    });
  };

  const handleStep23Promotion = async () => {
    const sourceClass = getPrimaryClassCodeForYear(2);
    const targetClass = getPrimaryClassCodeForYear(3);
    await processBulkPromote(sourceClass, targetClass);
  };

  const handleStep12Promotion = async () => {
    const sourceClass = getPrimaryClassCodeForYear(1);
    const targetClass = getPrimaryClassCodeForYear(2);
    await processBulkPromote(sourceClass, targetClass);
  };

  const handleBulkDeleteStudents = async () => {
    const thirdYearOption = dynamicClassOptions.find((g) =>
      g.group.includes("3rd Year"),
    )?.options[0];
    const target = thirdYearOption?.value;
    if (!target) {
      warning("Could not identify 3rd year class.");
      return;
    }

    const studentsToDelete = students.filter((s) => s.targetClass === target);
    if (studentsToDelete.length === 0) {
      setWorkflowProgress((prev) => ({
        ...prev,
        cleanup3Done: true,
      }));
      return;
    }

    openDetainedInputModal({
      action: "cleanup3",
      title: "Step 1: Graduation Cleanup (3rd Year)",
      message:
        "Enter detained student roll numbers separated by commas or spaces. These students will NOT be cleared and will stay in 3rd year.",
      sourceClass: target,
      targetClass: "",
      candidates: studentsToDelete,
    });
  };

  const getYearFromClassCode = (classCode) => {
    const normalized = String(classCode || "")
      .trim()
      .toUpperCase();
    if (!normalized) return null;

    const legacyPattern = normalized.match(/^([1-3])Y/);
    if (legacyPattern) return parseInt(legacyPattern[1], 10);

    const semPattern = normalized.match(/([1-6])/);
    if (!semPattern) return null;
    const semNo = parseInt(semPattern[1], 10);
    if (semNo <= 2) return 1;
    if (semNo <= 4) return 2;
    return 3;
  };

  const getSilentSemesterShiftTarget = (classCode) => {
    const normalized = String(classCode || "")
      .trim()
      .toUpperCase();
    if (!normalized) return null;

    // New format: CM1K, CM3K, ...
    const semPattern = normalized.match(/^([A-Z]+)([1-6])([A-Z])$/);
    if (semPattern) {
      const [, deptCode, semNoRaw, schemeLetter] = semPattern;
      const semNo = parseInt(semNoRaw, 10);
      if (semNo % 2 === 1 && semNo < 6) {
        return `${deptCode}${semNo + 1}${schemeLetter}`;
      }
      return null;
    }

    // Legacy format: 1YCMK, 2YCMK, 3YCMK
    const legacyPattern = normalized.match(/^([1-3])Y([A-Z]+)([A-Z])$/);
    if (legacyPattern) {
      const [, yearNoRaw, deptCode, schemeLetter] = legacyPattern;
      const yearNo = parseInt(yearNoRaw, 10);
      return `${deptCode}${yearNo * 2}${schemeLetter}`;
    }

    return null;
  };

  const resetYearOptions = React.useMemo(
    () =>
      dynamicClassOptions.map((g) => ({
        value: String(g.options?.[0]?.value || ""),
        label: g.group || "",
      })),
    [dynamicClassOptions],
  );

  const thirdYearStudentsCount = useMemo(
    () =>
      students.filter((s) => getYearFromClassCode(s.targetClass) === 3).length,
    [students],
  );
  const secondYearStudentsCount = useMemo(
    () =>
      students.filter((s) => getYearFromClassCode(s.targetClass) === 2).length,
    [students],
  );
  const cleanupLockMessage = workflowProgress.promote23Done
    ? "Step 1 locked: already completed for current cycle."
    : "";
  const step1Locked = isSubmitting || !!cleanupLockMessage;
  const step2Locked =
    isSubmitting ||
    (thirdYearStudentsCount > 0 && !workflowProgress.cleanup3Done);
  const step3Locked = isSubmitting || !workflowProgress.promote23Done;
  const activeLifecycleStep =
    thirdYearStudentsCount > 0 && !workflowProgress.cleanup3Done
      ? 1
      : !workflowProgress.promote23Done
        ? 2
        : 3;

  useEffect(() => {
    if (activeTab !== "lifecycle") return;
    if (!studentsLoaded) return;

    // Auto-skip Step 1 if there are no 3rd year students.
    if (thirdYearStudentsCount === 0 && !workflowProgress.cleanup3Done) {
      setWorkflowProgress((prev) => ({ ...prev, cleanup3Done: true }));
      return;
    }

    // Auto-skip Step 2 if there are no 2nd year students.
    if (
      workflowProgress.cleanup3Done &&
      secondYearStudentsCount === 0 &&
      !workflowProgress.promote23Done
    ) {
      setWorkflowProgress((prev) => ({ ...prev, promote23Done: true }));
    }
  }, [
    activeTab,
    studentsLoaded,
    thirdYearStudentsCount,
    secondYearStudentsCount,
    workflowProgress.cleanup3Done,
    workflowProgress.promote23Done,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        lifecycleStorageKey,
        JSON.stringify(workflowProgress),
      );
    } catch {
      // ignore storage failures
    }
  }, [lifecycleStorageKey, workflowProgress]);

  const handleBulkResetStatus = async () => {
    if (!resetClassTarget) {
      warning("Please select a year.");
      return;
    }
    const selectedYear = getYearFromClassCode(resetClassTarget);
    if (!selectedYear) {
      warning("Could not identify selected year.");
      return;
    }

    const studentsToReset = students.filter(
      (s) => getYearFromClassCode(s.targetClass) === selectedYear,
    );
    if (studentsToReset.length === 0) {
      warning("No students found in selected year.");
      return;
    }
    const studentsToShift = studentsToReset.filter((s) =>
      Boolean(getSilentSemesterShiftTarget(s.targetClass)),
    );
    if (studentsToShift.length === 0) {
      warning("No students are eligible for semester shift in selected year.");
      return;
    }

    setResetCandidates(studentsToShift);
    setExcludedFromReset(new Set());
    setShowResetModal(true);
  };

  const executeBulkReset = async () => {
    const finalResetList = resetCandidates.filter(
      (s) => !excludedFromReset.has(s.id),
    );

    if (finalResetList.length === 0) {
      warning("No students selected for reset.");
      return;
    }

    setIsSubmitting(true);
    setShowResetModal(false);
    try {
      const batch = writeBatch(db);
      finalResetList.forEach((std) => {
        const shiftedClass = getSilentSemesterShiftTarget(std.targetClass);
        batch.update(doc(db, "Students", std.id), {
          targetClass: shiftedClass,
          status: "pending",
        });
      });
      await batch.commit();
      success("Reset feedback successful.");
      setResetClassTarget("");
      fetchData();
    } catch (err) {
      console.error(err);
      notifyError("Status reset failed.");
    }
    setIsSubmitting(false);
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "Students", editingStudentId), {
        name: editForm.name.trim(),
        rollNo: editForm.roll,
        enrollmentNo: editForm.enroll.trim(),
        email: editForm.email.trim(),
        targetClass: editForm.tClass,
        division: editForm.div,
      });
      setEditingStudentId(null);
      fetchData();
      success("Student updated successfully.");
    } catch {
      notifyError("Failed to update student.");
    }
  };

  const handleUpdateSubject = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "Subjects", editingSubjectId), {
        name: editSubjectForm.name.trim(),
        code: editSubjectForm.code.toUpperCase().trim(),
        semester: editSubjectForm.semester,
        isElective: editSubjectForm.isElective,
      });
      setEditingSubjectId(null);
      fetchData();
      success("Subject updated successfully.");
    } catch {
      notifyError("Failed to update subject.");
    }
  };

  const filteredSubjectList = subjectSemesterFilter
    ? subjectList.filter(
        (s) => String(s.semester || "") === subjectSemesterFilter,
      )
    : subjectList;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col xl:flex-row items-center justify-between gap-6 print:hidden bg-white/80 backdrop-blur-xl p-5 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-200/50 relative overflow-hidden">
          <div className="flex items-center gap-4 w-full xl:w-auto">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg shadow-indigo-200 shrink-0">
              <Building2 size={24} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                HOD Portal
              </h1>
              <h2 className="text-sm font-medium text-slate-500 mt-0.5 truncate">
                {user.dept} - Manage students, subjects, allotments, and
                analytics.
              </h2>
            </div>
          </div>
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200/60 w-full xl:w-auto"
            role="tablist"
            aria-label="HOD sections"
          >
            {[
              { id: "students", label: "Add Students", icon: UserPlus },
              { id: "directory", label: "Directory", icon: Users },
              { id: "subjects", label: "Manage Subjects", icon: BookOpen },
              { id: "allot", label: "Allot", icon: Link },
              { id: "lifecycle", label: "Lifecycle", icon: RefreshCw },
              { id: "monitor", label: "Monitor", icon: Activity },
              { id: "reports", label: "Reports", icon: PieChart },
              { id: "controls", label: "Controls", icon: Settings },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap w-full ${
                  activeTab === t.id
                    ? "bg-white text-violet-700 shadow-md ring-1 ring-slate-200 scale-100"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                }`}
              >
                <t.icon
                  size={16}
                  className={
                    activeTab === t.id ? "text-violet-600" : "text-slate-400"
                  }
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === "students" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start animate-in slide-in-from-bottom-4 duration-500">
            <Card className="overflow-hidden border-indigo-100 shadow-md">
              <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50/50 p-7 relative">
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-200 rounded-full blur-3xl opacity-40 z-0 pointer-events-none"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-violet-200 rounded-full blur-3xl opacity-30 z-0 pointer-events-none"></div>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 relative z-10">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
                    <Upload
                      className="h-6 w-6 text-indigo-600"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
                      Import Student Batch
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 mb-1 leading-relaxed max-w-xl font-medium">
                      Columns required: Name, Roll (15xx / 25xx / 35xx), PRN,
                      and{" "}
                      <strong className="text-indigo-600 font-semibold">
                        Email
                      </strong>{" "}
                      (for OTP).
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-white/60 p-5 ring-1 ring-slate-200 shadow-sm backdrop-blur-md relative z-10">
                  <div className="flex w-full md:min-w-[150px] flex-1 flex-col gap-1.5 relative z-50">
                    <span className="text-xs font-semibold text-slate-700 ml-1">
                      Select Year
                    </span>
                    <CustomSelect
                      value={excelClass}
                      onChange={(val) => setExcelClass(val)}
                      options={dynamicClassOptions}
                      placeholder="Select Year"
                    />
                  </div>
                  <div className="flex w-full md:min-w-[120px] md:max-w-[150px] flex-col gap-1.5 relative z-40">
                    <span className="text-xs font-semibold text-slate-700 ml-1">
                      Division
                    </span>
                    <CustomSelect
                      value={excelDiv}
                      onChange={(val) => setExcelDiv(val)}
                      options={[
                        { value: "A", label: "Div A" },
                        { value: "B", label: "Div B" },
                      ]}
                      placeholder="Select Division"
                    />
                  </div>
                  <label className="flex w-full md:w-auto md:flex-1 min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:from-indigo-700 hover:to-violet-700 transition-all md:min-w-[160px] scale-100 hover:scale-[1.02] active:scale-95">
                    {isSubmitting ? "Uploading…" : "Choose Excel file"}
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx, .xls"
                      disabled={isSubmitting}
                      onChange={(e) => {
                        if (!excelClass) {
                          warning("Select a target class first.");
                          return;
                        }
                        handleExcelUpload(e);
                      }}
                    />
                  </label>
                </div>
              </div>
            </Card>

            {/* Manual Student Form */}
            <Card className="p-0 overflow-hidden shadow-sm relative border border-slate-200/80">
              <div className="border-b border-indigo-50 bg-indigo-50/50 px-5 py-4">
                <h3 className="font-extrabold text-indigo-950 text-base">
                  Add Student Manually
                </h3>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed font-medium">
                  Register a single student. Ensure PRN and Email are correct
                  for portal access.
                </p>
              </div>
              <form
                onSubmit={handleManualStudent}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6"
              >
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Full Name
                  </label>
                  <input
                    placeholder="As per registration"
                    className="input-app py-2.5 text-sm font-semibold"
                    value={stdForm.name}
                    onChange={(e) =>
                      setStdForm({ ...stdForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Roll No.
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 1523"
                    maxLength={4}
                    title={ROLL_NUMBER_HINT}
                    className="input-app py-2.5 text-sm font-semibold tabular-nums tracking-widest"
                    value={stdForm.roll}
                    onChange={(e) =>
                      setStdForm({
                        ...stdForm,
                        roll: normalizeRollDigits(e.target.value),
                      })
                    }
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Enrollment (PRN)
                  </label>
                  <input
                    placeholder="PRN"
                    className="input-app py-2.5 text-sm font-semibold"
                    value={stdForm.enroll}
                    onChange={(e) =>
                      setStdForm({ ...stdForm, enroll: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="student@example.com"
                    className="input-app py-2.5 text-sm font-semibold"
                    value={stdForm.email}
                    onChange={(e) =>
                      setStdForm({ ...stdForm, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="md:col-span-4 relative z-[60]">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Year
                  </label>
                  <CustomSelect
                    value={stdForm.tClass}
                    onChange={(val) => setStdForm({ ...stdForm, tClass: val })}
                    options={dynamicClassOptions}
                    placeholder="Select Year"
                  />
                </div>
                <div className="md:col-span-2 relative z-50">
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    Division
                  </label>
                  <CustomSelect
                    value={stdForm.div}
                    onChange={(val) => setStdForm({ ...stdForm, div: val })}
                    options={[
                      { value: "A", label: "A" },
                      { value: "B", label: "B" },
                    ]}
                    placeholder="Select Division"
                  />
                </div>
                <div className="md:col-span-12 lg:col-span-12 xl:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full xl:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Saving…" : "Save Student"}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {activeTab === "lifecycle" && (
          <div className="max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            {/* Student Lifecycle Tools */}
            <Card className="overflow-hidden border-orange-100 shadow-md">
              <div className="bg-gradient-to-br from-orange-50 via-white to-amber-50/50 p-8 md:p-10 relative">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5 mb-8">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-orange-200 shadow-sm">
                    <RefreshCw className="h-7 w-7 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                      Student Lifecycle Tools
                    </h2>
                    <p className="text-slate-500 text-base mt-1 font-semibold">
                      Manage student promotions, semester feedback resets, and
                      graduations.
                    </p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-800 uppercase tracking-wider">
                      What this does
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
                      This tool runs the annual cycle safely: it clears the
                      outgoing 3rd year batch, then promotes 2nd to 3rd, then
                      promotes 1st to 2nd.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
                      Why this order matters: it prevents different batches from
                      mixing and avoids accidentally clearing newly promoted
                      students. In each step, you can enter detained roll
                      numbers so those students stay in the same year.
                    </p>
                  </div>
                  {!studentsLoaded ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-600">
                        Loading lifecycle status…
                      </p>
                      <RefreshCw
                        size={18}
                        className="text-slate-400 animate-spin"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          Step {activeLifecycleStep} of 3
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              activeLifecycleStep === 1
                                ? "bg-red-500"
                                : workflowProgress.cleanup3Done ||
                                    thirdYearStudentsCount === 0
                                  ? "bg-emerald-500"
                                  : "bg-slate-300"
                            }`}
                          />
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              activeLifecycleStep === 2
                                ? "bg-orange-500"
                                : workflowProgress.promote23Done
                                  ? "bg-emerald-500"
                                  : "bg-slate-300"
                            }`}
                          />
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              activeLifecycleStep === 3
                                ? "bg-indigo-500"
                                : "bg-slate-300"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {studentsLoaded && activeLifecycleStep === 1 && (
                    <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                          <Trash2 size={16} /> Step 1 - Cleanup 3rd Year
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                            workflowProgress.cleanup3Done
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {workflowProgress.cleanup3Done
                            ? "Completed"
                            : "Ready"}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-500">
                        Detected: {thirdYearStudentsCount} student(s) in 3rd
                        year
                      </p>
                      <p className="text-xs font-semibold text-red-700/90">
                        Clear outgoing 3rd year students. Enter detained roll
                        numbers to keep repeaters.
                      </p>
                      <button
                        onClick={handleBulkDeleteStudents}
                        disabled={step1Locked}
                        className="w-full px-5 h-12 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-red-100 active:scale-95 disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:shadow-none disabled:text-slate-600"
                      >
                        Clear Outgoing 3rd Year
                      </button>
                      {cleanupLockMessage && (
                        <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                          {cleanupLockMessage}
                        </p>
                      )}
                    </div>
                  )}

                  {studentsLoaded && activeLifecycleStep === 2 && (
                    <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-orange-700 uppercase tracking-widest flex items-center gap-2">
                          <ArrowUpCircle size={16} /> Step 2 - Promote 2nd to
                          3rd
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                            workflowProgress.promote23Done
                              ? "bg-emerald-100 text-emerald-700"
                              : step2Locked
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {workflowProgress.promote23Done
                            ? "Completed"
                            : step2Locked
                              ? "Locked"
                              : "Ready"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-orange-700/90">
                        Promotes all eligible 2nd-year students. Detained roll
                        numbers stay in 2nd year.
                      </p>
                      <p className="text-[11px] font-bold text-slate-500">
                        Detected: {secondYearStudentsCount} student(s) in 2nd
                        year
                      </p>
                      <button
                        onClick={handleStep23Promotion}
                        disabled={step2Locked}
                        className="w-full px-5 h-12 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-orange-100 active:scale-95 disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:shadow-none disabled:text-slate-600"
                      >
                        Promote 2nd to 3rd
                      </button>
                      {thirdYearStudentsCount > 0 &&
                        !workflowProgress.cleanup3Done && (
                          <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                            Step 2 locked until Step 1 is completed.
                          </p>
                        )}
                    </div>
                  )}

                  {studentsLoaded && activeLifecycleStep === 3 && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                          <ArrowUpCircle size={16} /> Step 3 - Promote 1st to
                          2nd
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                            step3Locked
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {step3Locked ? "Locked" : "Ready"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-indigo-700/90">
                        Promotes all eligible 1st-year students. Detained roll
                        numbers stay in 1st year.
                      </p>
                      <button
                        onClick={handleStep12Promotion}
                        disabled={step3Locked}
                        className="w-full px-5 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:shadow-none disabled:text-slate-600"
                      >
                        Promote 1st to 2nd
                      </button>
                      {!workflowProgress.promote23Done && (
                        <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                          Step 3 locked until Step 2 is completed.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Semester Isolation / Status Reset */}
                  <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100 space-y-5">
                    <h4 className="text-sm font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                      <RefreshCw size={16} /> Optional - New Semester Feedback
                      Reset
                    </h4>
                    <p className="text-sm text-blue-800/80 mb-2 font-bold uppercase tracking-tight">
                      Select a year and reset status for the next semester
                      feedback cycle.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <CustomSelect
                          value={resetClassTarget}
                          onChange={(val) => setResetClassTarget(val)}
                          options={resetYearOptions}
                          placeholder="Select Target Year"
                        />
                      </div>
                      <button
                        onClick={handleBulkResetStatus}
                        disabled={isSubmitting || !resetClassTarget}
                        className="px-8 h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-blue-200 active:scale-95"
                      >
                        Reset Feedback Status
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Inventory / Directory Tab */}
        {activeTab === "directory" && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <Card className="flex flex-col border-indigo-100 bg-white shadow-sm p-0 overflow-hidden">
              <div className="border-b border-indigo-50 bg-indigo-50/50 px-5 py-5 sticky top-0 z-10">
                <h3 className="font-extrabold text-indigo-950 flex items-center justify-between text-base">
                  Student directory
                  <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-black text-white tabular-nums shadow-sm">
                    {filteredStudents.length}
                  </span>
                </h3>
                <div className="mt-4 flex flex-col items-stretch gap-4">
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-2 border border-slate-200/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-semibold transition-all hover:border-indigo-300 bg-white shadow-sm"
                      placeholder="Search by name, roll, or PRN..."
                      value={searchRollNo}
                      onChange={(e) => setSearchRollNo(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full relative z-[60]">
                    <div className="w-full sm:min-w-[200px] flex-1">
                      <CustomSelect
                        value={filterClass}
                        onChange={(val) => setFilterClass(val)}
                        options={[
                          ...dynamicClassOptions.flatMap((g) =>
                            g.options.map((opt) => ({
                              value: opt.value,
                              label: opt.label,
                            })),
                          ),
                        ]}
                        placeholder="Select Year"
                      />
                    </div>
                    <div className="w-full sm:min-w-[140px] flex-1">
                      <CustomSelect
                        value={filterDivision}
                        onChange={(val) => setFilterDivision(val)}
                        options={[
                          { value: "A", label: "Div A" },
                          { value: "B", label: "Div B" },
                        ]}
                        placeholder="Select Division"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-4 space-y-3 bg-slate-50/30">
                {filteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center h-[300px]">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-300 shadow-inner">
                      <Users size={32} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-bold text-slate-600">
                      {!searchRollNo && !filterClass && !filterDivision
                        ? "Please apply a filter to view directory data"
                        : filterClass && !filterDivision
                          ? "Please select division"
                          : "No students found"}
                    </p>
                    <p className="mt-1.5 max-w-[200px] text-[11px] leading-relaxed text-slate-400">
                      {!searchRollNo && !filterClass && !filterDivision
                        ? "Select a year, division, or search by name to display records."
                        : filterClass && !filterDivision
                          ? "Choose a division to narrow students for the selected year."
                          : "Try adjusting your search or imported records."}
                    </p>
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    if (editingStudentId === s.id) {
                      return (
                        <div
                          key={s.id}
                          className="p-4 bg-white rounded-2xl border-2 border-indigo-400 shadow-md transition-all relative z-50 animate-in fade-in zoom-in-95 duration-200"
                        >
                          <form
                            onSubmit={handleUpdateStudent}
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                          >
                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                Full Name
                              </label>
                              <input
                                required
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    name: e.target.value,
                                  })
                                }
                                className="input-app py-2 text-sm font-semibold w-full"
                                placeholder="Full Name"
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                Roll No.
                              </label>
                              <input
                                required
                                value={editForm.roll}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    roll: normalizeRollDigits(e.target.value),
                                  })
                                }
                                className="input-app py-2 text-sm font-semibold tabular-nums w-full"
                                placeholder="Roll No"
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                PRN
                              </label>
                              <input
                                required
                                value={editForm.enroll}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    enroll: e.target.value,
                                  })
                                }
                                className="input-app py-2 text-sm font-semibold w-full"
                                placeholder="PRN"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                Email
                              </label>
                              <input
                                required
                                type="email"
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    email: e.target.value,
                                  })
                                }
                                className="input-app py-2 text-sm font-semibold w-full"
                                placeholder="Email"
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                Class
                              </label>
                              <select
                                className="input-app py-2 text-sm font-semibold w-full"
                                value={editForm.tClass}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    tClass: e.target.value,
                                  })
                                }
                              >
                                {dynamicClassOptions
                                  .flatMap((g) => g.options)
                                  .map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                                Division
                              </label>
                              <select
                                className="input-app py-2 text-sm font-semibold w-full"
                                value={editForm.div}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    div: e.target.value,
                                  })
                                }
                              >
                                <option value="A">Div A</option>
                                <option value="B">Div B</option>
                              </select>
                            </div>
                            <div className="md:col-span-2 flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setEditingStudentId(null)}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all active:scale-95"
                              >
                                Save
                              </button>
                            </div>
                          </form>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={s.id}
                        className="group flex flex-col sm:flex-row items-start justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/10 animate-in fade-in duration-300"
                      >
                        <div className="min-w-0 w-full sm:w-auto flex-1">
                          <p className="text-sm font-extrabold text-slate-800 truncate">
                            {s.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-600">
                              {s.targetClass} · Div {s.division || "A"}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                              {s.enrollmentNo}
                            </span>
                          </div>
                          {s.email && (
                            <p className="mt-1.5 truncate text-[10px] font-bold text-slate-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                              {s.email}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-slate-100 sm:border-0 border-dashed">
                          <button
                            type="button"
                            title="Edit student"
                            onClick={() => {
                              setEditingStudentId(s.id);
                              setEditForm({
                                name: s.name || "",
                                roll: s.rollNo || "",
                                enroll: s.enrollmentNo || "",
                                email: s.email || "",
                                tClass: s.targetClass || "",
                                div: s.division || "A",
                              });
                            }}
                            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none"
                          >
                            <Edit2 size={16} />{" "}
                            <span className="hidden xs:inline">Edit</span>
                          </button>
                          <button
                            type="button"
                            title="Remove student"
                            onClick={async () => {
                              if (window.confirm(`Delete student ${s.name}?`)) {
                                await deleteDoc(doc(db, "Students", s.id));
                                fetchData();
                              }
                            }}
                            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none"
                          >
                            <Trash2 size={16} />{" "}
                            <span className="hidden xs:inline">Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        )}

        {/* SUBJECTS TAB (YOUR CODE) */}
        {activeTab === "subjects" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start animate-in slide-in-from-bottom-4 duration-500">
            <Card className="p-0 overflow-hidden border-indigo-100 shadow-md relative w-full">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
              <div className="px-8 py-6 border-b border-slate-100 bg-white/50">
                <h2 className="text-xl font-extrabold flex items-center gap-3 text-slate-800">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <BookOpen
                      className="text-emerald-500"
                      size={24}
                      strokeWidth={2.5}
                    />
                  </div>
                  Manage Subject
                </h2>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!subForm.semester) {
                    warning("Please select a semester for this subject.");
                    return;
                  }
                  try {
                    await addDoc(collection(db, "Subjects"), {
                      name: subForm.name,
                      code: subForm.code.toUpperCase(),
                      semester: subForm.semester,
                      department: user.dept,
                      isElective: subForm.isElective,
                    });
                    setSubForm({
                      name: "",
                      code: "",
                      semester: "",
                      isElective: false,
                    });
                    fetchData();
                    success("Subject saved.");
                  } catch {
                    notifyError("Could not save subject.");
                  }
                }}
                className="p-8 space-y-5 bg-slate-50/30"
              >
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-widest ml-1 mb-1.5 block">
                    Subject Name
                  </label>
                  <input
                    placeholder="e.g. Software Engineering"
                    className="input-app py-3 font-semibold text-sm"
                    value={subForm.name}
                    onChange={(e) =>
                      setSubForm({ ...subForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-widest ml-1 mb-1.5 block">
                    Semester
                  </label>
                  <CustomSelect
                    value={subForm.semester}
                    onChange={(val) =>
                      setSubForm({ ...subForm, semester: val })
                    }
                    options={groupedSemesterSelectOptions}
                    placeholder="Select Semester"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-widest ml-1 mb-1.5 block">
                    Subject Code
                  </label>
                  <input
                    placeholder="e.g. 22001"
                    className="input-app py-3 font-semibold text-sm uppercase"
                    value={subForm.code}
                    onChange={(e) =>
                      setSubForm({ ...subForm, code: e.target.value })
                    }
                    required
                  />
                </div>
                <label className="flex items-center gap-4 p-5 border border-slate-200/80 rounded-2xl cursor-pointer hover:border-emerald-300 hover:shadow-md hover:bg-emerald-50/30 transition-all bg-white shadow-sm group">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-emerald-500"
                    checked={subForm.isElective}
                    onChange={(e) =>
                      setSubForm({ ...subForm, isElective: e.target.checked })
                    }
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold text-slate-800 uppercase">
                      This is an Elective
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                      Students will choose this manually while giving feedback.
                    </span>
                  </div>
                </label>
                <button className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3.5 mt-4 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 transition-all active:scale-95 uppercase tracking-widest">
                  Save Subject
                </button>
              </form>
            </Card>
            <Card className="flex flex-col border-emerald-100 p-0 overflow-hidden shadow-sm md:max-h-[600px]">
              <div className="px-6 py-5 border-b border-emerald-50 bg-emerald-50/50 flex justify-between items-center">
                <h3 className="font-extrabold text-emerald-950 uppercase text-sm flex items-center gap-2">
                  Subject Inventory
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-full sm:w-auto sm:min-w-[140px]">
                    <CustomSelect
                      value={subjectSemesterFilter}
                      onChange={(val) => setSubjectSemesterFilter(val)}
                      options={[
                        { value: "", label: "All Semesters" },
                        ...semesterSelectOptions,
                      ]}
                      placeholder="All Semesters"
                    />
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black">
                    {filteredSubjectList.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30 max-h-[400px]">
                {filteredSubjectList.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <BookOpen
                      className="mx-auto mb-3 text-slate-400"
                      size={32}
                    />
                    <p className="font-bold text-sm">No Subjects Added</p>
                  </div>
                ) : (
                  filteredSubjectList.map((s) => {
                    if (editingSubjectId === s.id) {
                      return (
                        <div
                          key={s.id}
                          className="p-5 bg-white rounded-2xl border-2 border-emerald-400 shadow-md transition-all relative z-50"
                        >
                          <form
                            onSubmit={handleUpdateSubject}
                            className="flex flex-col gap-4"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                                  Subject Name
                                </label>
                                <input
                                  required
                                  value={editSubjectForm.name}
                                  onChange={(e) =>
                                    setEditSubjectForm({
                                      ...editSubjectForm,
                                      name: e.target.value,
                                    })
                                  }
                                  className="input-app py-2 text-sm font-semibold w-full"
                                  placeholder="Subject Name"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                                  Semester
                                </label>
                                <CustomSelect
                                  value={editSubjectForm.semester || ""}
                                  onChange={(val) =>
                                    setEditSubjectForm({
                                      ...editSubjectForm,
                                      semester: val,
                                    })
                                  }
                                  options={groupedSemesterSelectOptions}
                                  placeholder="Select Semester"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                                  Subject Code
                                </label>
                                <input
                                  required
                                  value={editSubjectForm.code}
                                  onChange={(e) =>
                                    setEditSubjectForm({
                                      ...editSubjectForm,
                                      code: e.target.value,
                                    })
                                  }
                                  className="input-app py-2 text-sm font-semibold uppercase w-full"
                                  placeholder="Code"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-emerald-500"
                                  checked={editSubjectForm.isElective}
                                  onChange={(e) =>
                                    setEditSubjectForm({
                                      ...editSubjectForm,
                                      isElective: e.target.checked,
                                    })
                                  }
                                />
                                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-widest">
                                  Elective
                                </span>
                              </label>
                              <div className="flex justify-end gap-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => setEditingSubjectId(null)}
                                  className="px-5 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all active:scale-95"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </form>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={s.id}
                        className="group flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:border-emerald-200 transition-all hover:shadow-md animate-in fade-in duration-300"
                      >
                        <div className="flex flex-col w-full sm:w-auto flex-1 min-w-0">
                          <span className="text-sm font-extrabold text-slate-800 truncate">
                            {s.name}
                          </span>
                          <span className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mt-0.5">
                            Code: {s.code}
                          </span>
                          <span className="text-emerald-600 font-bold text-[10px] tracking-widest uppercase mt-0.5">
                            Semester: {s.semester || "-"}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end mt-3 sm:mt-0 pt-3 sm:pt-0 border-t border-slate-100 sm:border-0 border-dashed">
                          {s.isElective && (
                            <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest">
                              Elective
                            </span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Edit subject"
                              onClick={() => {
                                setEditingSubjectId(s.id);
                                setEditSubjectForm({
                                  name: s.name || "",
                                  code: s.code || "",
                                  semester: String(s.semester || ""),
                                  isElective: s.isElective || false,
                                });
                              }}
                              className="flex items-center gap-1 p-2 rounded-xl text-sm font-bold text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 focus:outline-none"
                            >
                              <Edit2 size={16} />{" "}
                              <span className="hidden xs:inline">Edit</span>
                            </button>
                            <button
                              type="button"
                              title="Delete subject"
                              onClick={async () => {
                                if (
                                  window.confirm(`Delete subject ${s.name}?`)
                                ) {
                                  await deleteDoc(doc(db, "Subjects", s.id));
                                  fetchData();
                                }
                              }}
                              className="flex items-center gap-1 p-2 rounded-xl text-sm font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none"
                            >
                              <Trash2 size={16} />{" "}
                              <span className="hidden xs:inline">Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ALLOT TAB (YOUR CODE) */}
        {activeTab === "allot" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-500 items-start">
            {/* Left Column: Form */}
            <Card className="p-0 overflow-hidden border-orange-100 shadow-md relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-orange-400 to-amber-500"></div>
              <div className="px-8 py-6 border-b border-slate-100 bg-white/50">
                <h2 className="text-xl font-extrabold flex items-center gap-3 text-slate-800">
                  <div className="p-2 bg-orange-50 rounded-xl">
                    <Link
                      className="text-orange-500"
                      size={24}
                      strokeWidth={2.5}
                    />
                  </div>
                  Faculty Allotment
                </h2>
                <p className="text-xs font-bold text-slate-400 mt-2 tracking-wide">
                  Assign faculty to subjects for the current semester.
                </p>
              </div>
              <form
                onSubmit={handleAllotment}
                className="p-8 space-y-6 bg-slate-50/30"
              >
                {editingAllotmentId && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold text-orange-800 flex items-center justify-between gap-3">
                    <span className="truncate">
                      Editing allotment: {allotForm.staff || "Faculty"} -{" "}
                      {allotForm.subject || "Subject"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelEditAllotment}
                      className="shrink-0 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-orange-700 hover:bg-orange-100 transition-colors"
                    >
                      Exit Edit
                    </button>
                  </div>
                )}
                <div className="space-y-1.5 relative z-[80]">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Select Department
                  </label>
                  <CustomSelect
                    value={allotForm.staffDept}
                    onChange={(val) =>
                      setAllotForm({ ...allotForm, staffDept: val, staff: "" })
                    }
                    options={departmentsList.map((d) => ({
                      value: d,
                      label: d,
                    }))}
                    placeholder="Select Department"
                  />
                </div>
                <div className="space-y-1.5 relative z-[70]">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Select Faculty
                  </label>
                  <CustomSelect
                    value={allotForm.staff}
                    onChange={(val) =>
                      setAllotForm({ ...allotForm, staff: val })
                    }
                    options={allStaffList
                      .filter((s) => s.dept === allotForm.staffDept)
                      .map((s) => ({ value: s.name, label: s.name }))}
                    placeholder="Choose Staff"
                  />
                </div>
                <div className="space-y-1.5 relative z-[60]">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Select Subject
                  </label>
                  <CustomSelect
                    value={allotForm.subject}
                    onChange={(val) =>
                      setAllotForm({ ...allotForm, subject: val })
                    }
                    options={[
                      {
                        group: "--- MANDATORY ---",
                        options: allSubjectList
                          .filter(
                            (s) =>
                              s.department ===
                                (allotForm.staffDept || user.dept) &&
                              !s.isElective &&
                              (!allotForm.tClass ||
                                !s.semester ||
                                s.semester ===
                                  extractSemesterNumber(allotForm.tClass)),
                          )
                          .map((s) => ({
                            value: s.name,
                            label: `${s.name} (${s.code})${s.semester ? ` - Sem ${s.semester}` : ""}`,
                          })),
                      },
                      {
                        group: "--- ELECTIVE ---",
                        options: allSubjectList
                          .filter(
                            (s) =>
                              s.department ===
                                (allotForm.staffDept || user.dept) &&
                              s.isElective &&
                              (!allotForm.tClass ||
                                !s.semester ||
                                s.semester ===
                                  extractSemesterNumber(allotForm.tClass)),
                          )
                          .map((s) => ({
                            value: s.name,
                            label: `${s.name} (${s.code})${s.semester ? ` - Sem ${s.semester}` : ""}`,
                          })),
                      },
                    ]}
                    placeholder="Choose Subject"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 relative z-50">
                  <div className="space-y-1.5 relative z-40">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Target Class
                    </label>
                    <CustomSelect
                      value={allotForm.tClass}
                      onChange={(val) =>
                        setAllotForm({ ...allotForm, tClass: val })
                      }
                      options={dynamicClassOptionsForAllotment}
                      placeholder="Target Class"
                    />
                  </div>
                  <div className="space-y-1.5 relative z-30">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Division
                    </label>
                    <CustomSelect
                      value={allotForm.division}
                      onChange={(val) =>
                        setAllotForm({ ...allotForm, division: val })
                      }
                      options={[
                        { value: "A", label: "Div A" },
                        { value: "B", label: "Div B" },
                        { value: "All", label: "All Divisions" },
                      ]}
                      placeholder="Division"
                    />
                  </div>
                </div>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-3.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95 uppercase tracking-widest">
                    {editingAllotmentId
                      ? "Update Allotment"
                      : "Confirm Allotment"}
                  </button>
                </div>
              </form>
            </Card>

            {/* Right Column: List of current allotments */}
            <Card className="p-0 overflow-hidden border-orange-100 shadow-md relative flex flex-col h-full max-h-[800px]">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-amber-500 to-orange-400"></div>
              <div className="bg-white p-8 flex-1 overflow-hidden flex flex-col">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-5 flex items-center gap-2 shrink-0">
                  <div className="w-1.5 h-4 bg-orange-500 rounded-full"></div>
                  Current Allotments
                </h3>
                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                  {allocations.length === 0 ? (
                    <p className="text-center py-6 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      No active allotments found.
                    </p>
                  ) : (
                    allocations
                      .sort((a, b) => a.staff.localeCompare(b.staff))
                      .map((alloc) => (
                        <div
                          key={alloc.id}
                          className="group flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-orange-200 transition-all shadow-sm hover:shadow-md"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-800 truncate">
                              {alloc.staff}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${!alloc.subject?.trim() ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}
                              >
                                {alloc.subject?.trim() || "Unnamed Subject"}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md ring-1 ring-slate-100">
                                {alloc.targetClass || alloc.tClass} · Div{" "}
                                {alloc.division}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center ml-4 gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditAllotment(alloc)}
                              className={`p-2.5 rounded-xl transition-colors ${
                                editingAllotmentId === alloc.id
                                  ? "text-orange-700 bg-orange-100"
                                  : "text-slate-300 hover:text-orange-600 hover:bg-orange-50"
                              }`}
                              title="Edit allotment"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setAllotmentToDelete({
                                  id: alloc.id,
                                  staff: alloc.staff,
                                  subject: alloc.subject,
                                })
                              }
                              className="p-2.5 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete allotment"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* NEW: MONITOR TAB */}
        {activeTab === "monitor" && (
          <Card className="p-0 border-blue-100 flex flex-col overflow-hidden shadow-md animate-in slide-in-from-bottom-4 duration-500 md:max-h-[85vh]">
            <div className="p-6 border-b border-blue-50 bg-blue-50/30 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6 relative z-[80]">
              <h2 className="text-xl font-extrabold flex items-center gap-3 text-slate-800 uppercase tracking-tight">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Activity
                    className="text-blue-600"
                    size={24}
                    strokeWidth={2.5}
                  />
                </div>
                Live Monitor
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:flex xl:flex-row gap-4 w-full lg:w-auto items-end relative z-[70]">
                <div className="flex flex-col gap-1.5 w-full lg:w-56 relative z-[60]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Department
                  </span>
                  <CustomSelect
                    value={monitorDept}
                    onChange={(val) => {
                      setMonitorDept(val);
                      setMonitorStaff("");
                    }}
                    options={[
                      ...departmentsList.map((d) => ({ value: d, label: d })),
                    ]}
                    placeholder="Select Department"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-full lg:w-56 relative z-50">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Filter by Staff
                  </span>
                  <CustomSelect
                    value={monitorStaff}
                    onChange={(val) => {
                      setMonitorStaff(val);
                      setMonitorSubject("");
                    }}
                    options={monitorStaffOptions}
                    placeholder="Select Faculty"
                  />
                </div>
                {monitorStaff && (
                  <div className="flex flex-col gap-1.5 w-full lg:w-56 relative z-[45] animate-in fade-in duration-300">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                      Filter by Subject
                    </span>
                    <CustomSelect
                      value={monitorSubject}
                      onChange={(val) => setMonitorSubject(val)}
                      options={monitorSubjectOptions}
                      placeholder="All Subjects"
                    />
                  </div>
                )}
              </div>
            </div>

            {monitorDept && monitorStaff && monitorSubject ? (
              <div className="flex-1 overflow-auto bg-slate-50/30">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white sticky top-0 shadow-sm z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Date
                      </th>
                      <th className="p-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Student
                      </th>
                      <th className="p-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Target
                      </th>
                      <th className="p-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {filteredFeedbacks.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="text-center py-16 text-slate-400 font-bold text-sm"
                        >
                          No feedback matching your filters found.
                        </td>
                      </tr>
                    ) : (
                      filteredFeedbacks.map((fb) => (
                        <tr
                          key={fb.id}
                          className="hover:bg-blue-50/50 transition-colors group"
                        >
                          <td className="p-4 px-6 text-xs font-bold text-slate-600">
                            {fb.createdAt?.toDate().toLocaleDateString("en-GB")}
                          </td>
                          <td className="p-4 px-6 font-extrabold text-slate-800 text-sm">
                            {fb.studentName}
                          </td>
                          <td className="p-4 px-6 text-sm font-bold text-slate-700">
                            {fb.staffName} <br />
                            <span className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase mt-0.5 inline-block">
                              {fb.subject}
                            </span>
                          </td>
                          <td className="p-4 px-6 text-center">
                            <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-blue-100 text-blue-700 shadow-sm border border-blue-200 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {(
                                fb.totalScore / FEEDBACK_QUESTIONS.length
                              ).toFixed(1)}
                              /5.0
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center bg-blue-50/20 flex flex-col items-center justify-center">
                <Activity size={48} className="text-blue-200 mb-4" />
                <h3 className="text-lg font-black text-blue-900 uppercase tracking-tight">
                  Select Filters to Monitor
                </h3>
                <p className="text-sm text-blue-600/70 font-medium mt-2 max-w-sm mx-auto">
                  Please select a specific Department, Faculty member, and
                  Subject above to view live feedback data.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Detained Roll Input Modal */}
        {detainedInputModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <Card className="w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-orange-100 bg-orange-50/30 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-orange-900">
                    {detainedInputModal.title}
                  </h3>
                  <p className="text-xs font-bold text-orange-600 mt-1">
                    {detainedInputModal.message}
                  </p>
                </div>
                <button
                  onClick={closeDetainedFlow}
                  className="p-2 hover:bg-orange-100 rounded-xl text-orange-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 bg-slate-50/50">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                    Students in this step:{" "}
                    {detainedInputModal.candidates.length}
                  </p>
                  <textarea
                    value={detainedRollInput}
                    onChange={(e) => {
                      setDetainedRollInput(e.target.value);
                      if (
                        detainedInputErrors.invalid.length ||
                        detainedInputErrors.notFound.length
                      ) {
                        setDetainedInputErrors({ invalid: [], notFound: [] });
                      }
                    }}
                    rows={4}
                    placeholder="Enter detained roll numbers (comma or space separated)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                {(detainedInputErrors.invalid.length > 0 ||
                  detainedInputErrors.notFound.length > 0) && (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 space-y-2">
                    {detainedInputErrors.invalid.length > 0 && (
                      <p className="text-[11px] font-bold text-red-700">
                        Invalid roll numbers:{" "}
                        {detainedInputErrors.invalid.join(", ")}
                      </p>
                    )}
                    {detainedInputErrors.notFound.length > 0 && (
                      <p className="text-[11px] font-bold text-red-700">
                        Not found in this step:{" "}
                        {detainedInputErrors.notFound.join(", ")}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[11px] font-semibold text-slate-500">
                  Leave empty if no detained students for this step.
                </p>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3 bg-white">
                <button
                  onClick={closeDetainedFlow}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedWithDetainedRolls}
                  className="flex-[2] px-6 py-3 rounded-xl text-sm font-black text-white bg-orange-600 shadow-lg shadow-orange-200 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Proceed
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Detained Confirmation Modal */}
        {detainedConfirmModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <Card className="w-full max-w-xl p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-indigo-100 bg-indigo-50/30 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-indigo-900">
                    {detainedConfirmModal.title}
                  </h3>
                  <p className="text-xs font-bold text-indigo-600 mt-1">
                    These detained students will stay in their current year.
                  </p>
                </div>
                <button
                  onClick={closeDetainedFlow}
                  className="p-2 hover:bg-indigo-100 rounded-xl text-indigo-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 bg-slate-50/50 max-h-[55vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                      Total
                    </p>
                    <p className="text-lg font-black text-slate-800">
                      {detainedConfirmModal.candidates.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-amber-200 p-3">
                    <p className="text-[10px] text-amber-500 font-bold uppercase">
                      Detained
                    </p>
                    <p className="text-lg font-black text-amber-700">
                      {detainedConfirmModal.detainedStudents.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-emerald-200 p-3">
                    <p className="text-[10px] text-emerald-500 font-bold uppercase">
                      {detainedConfirmModal.action === "cleanup3"
                        ? "Will Be Cleared"
                        : "Will Be Promoted"}
                    </p>
                    <p className="text-lg font-black text-emerald-700">
                      {detainedConfirmModal.processableStudents.length}
                    </p>
                  </div>
                </div>
                {detainedConfirmModal.duplicateCount > 0 && (
                  <p className="text-[11px] font-semibold text-slate-500">
                    Duplicate entries ignored:{" "}
                    {detainedConfirmModal.duplicateCount}
                  </p>
                )}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wide mb-3">
                    Detained Students
                  </p>
                  {detainedConfirmModal.detainedStudents.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-500">
                      No detained students entered.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detainedConfirmModal.detainedStudents.map((std) => (
                        <div
                          key={std.id}
                          className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-3 py-2"
                        >
                          <span className="text-sm font-black text-amber-800">
                            {std.name}
                          </span>
                          <span className="text-[11px] font-bold text-amber-700">
                            {std.rollNo}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3 bg-white">
                <button
                  onClick={closeDetainedFlow}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDetainedAction}
                  className={`flex-[2] px-6 py-3 rounded-xl text-sm font-black text-white transition-all hover:scale-[1.02] active:scale-95 ${
                    detainedConfirmModal.action === "cleanup3"
                      ? "bg-red-600 shadow-lg shadow-red-200"
                      : "bg-blue-600 shadow-lg shadow-blue-200"
                  }`}
                >
                  {detainedConfirmModal.action === "cleanup3"
                    ? "Clear 3rd Year Batch"
                    : "Promote Students"}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Semester Reset Confirmation Modal */}
        {showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <Card className="w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-blue-100 bg-blue-50/30 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-blue-900">
                    Confirm Semester Reset
                  </h3>
                  <p className="text-xs font-bold text-blue-600 mt-1">
                    Reset Feedback Status for Students
                  </p>
                </div>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="p-2 hover:bg-blue-100 rounded-xl text-blue-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[50vh] overflow-y-auto bg-slate-50/50">
                <div className="space-y-2">
                  {resetCandidates.map((std) => {
                    const isExcluded = excludedFromReset.has(std.id);
                    const nextSem = getSilentSemesterShiftTarget(
                      std.targetClass,
                    );
                    return (
                      <div
                        key={std.id}
                        onClick={() => {
                          const newSet = new Set(excludedFromReset);
                          if (isExcluded) newSet.delete(std.id);
                          else newSet.add(std.id);
                          setExcludedFromReset(newSet);
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          isExcluded
                            ? "bg-slate-100 border-slate-200 opacity-60"
                            : "bg-white border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                              isExcluded
                                ? "border-slate-300 bg-white text-slate-300"
                                : "border-blue-400 bg-blue-500 text-white"
                            }`}
                          >
                            {!isExcluded && <CheckCircle size={14} />}
                            {isExcluded && <X size={14} />}
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`text-xs font-black truncate ${isExcluded ? "text-slate-400" : "text-slate-800"}`}
                            >
                              {std.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {std.targetClass} →{" "}
                              <span className="text-blue-600">{nextSem}</span>
                            </p>
                          </div>
                        </div>
                        {isExcluded && (
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-200 rounded-md">
                            Skipped
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3 bg-white">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBulkReset}
                  className="flex-[2] px-6 py-3 rounded-xl text-sm font-black text-white bg-blue-600 shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Confirm & Reset{" "}
                  {resetCandidates.length - excludedFromReset.size} Students
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Delete Allotment Confirmation Modal */}
        {allotmentToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <Card className="w-full max-w-md p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="p-8 text-center">
                <div className="mx-auto w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 ring-4 ring-red-50/50">
                  <Trash2
                    className="text-red-500"
                    size={32}
                    strokeWidth={2.5}
                  />
                </div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                  Remove Allotment?
                </h3>
                <div className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">
                  You are about to delete the subject allocation for:
                  <div className="font-black text-slate-800 mt-2 text-base">
                    {allotmentToDelete.staff}
                  </div>
                  <div className="text-xs font-bold text-red-500 uppercase tracking-widest bg-red-50 px-2 py-1 rounded-md inline-block mt-1">
                    {allotmentToDelete.subject?.trim() || "Unnamed Subject"}
                  </div>
                </div>
                <p className="text-[11px] font-bold text-slate-400 mt-6 uppercase tracking-wider">
                  This action cannot be undone.
                </p>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setAllotmentToDelete(null)}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Keep it
                </button>
                <button
                  onClick={handleDeleteAllocation}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Yes, Delete
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* NEW: REPORTS TAB */}
        {activeTab === "reports" && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="p-0 border-slate-200 overflow-hidden shadow-sm print:hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-2">
                <PieChart className="text-slate-500" size={18} />
                <h3 className="font-extrabold text-slate-800 uppercase tracking-widest text-xs">
                  Report Configuration
                </h3>
              </div>
              <div className="p-6 md:p-8 flex flex-col gap-6 items-stretch justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-5 flex-1 w-full xl:w-auto items-end">
                  <div className="w-full sm:w-auto flex-1 min-w-0 sm:min-w-[120px]">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-widest">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      value={acadYear}
                      onChange={(e) => setAcadYear(e.target.value)}
                      className="input-app text-sm font-bold py-2.5 w-full"
                      placeholder="e.g. 2024-25"
                    />
                  </div>

                  <div className="w-full sm:w-auto flex-[1] min-w-0 sm:min-w-[180px] relative z-[60]">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-widest">
                      Department
                    </label>
                    <CustomSelect
                      value={reportDept}
                      onChange={(val) => {
                        setReportDept(val);
                        setReportStaff("");
                        setReportSubject("");
                      }}
                      options={[
                        { value: "", label: "All Departments" },
                        ...departmentsList.map((d) => ({
                          value: d,
                          label: d,
                        })),
                      ]}
                      placeholder="Select Department"
                    />
                  </div>
                  <div className="w-full sm:w-auto flex-[2] min-w-0 sm:min-w-[200px] relative z-[60]">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-widest">
                      Faculty
                    </label>
                    <CustomSelect
                      value={reportStaff}
                      onChange={(val) => {
                        setReportStaff(val);
                        const nextSubjects = [
                          ...new Set(
                            [...feedbacks, ...exitForms]
                              .filter((f) => f.staffName === val)
                              .map((f) => f.subject),
                          ),
                        ];
                        setReportSubject(
                          nextSubjects.length > 0 ? nextSubjects[0] : "",
                        );
                      }}
                      options={(reportDept
                        ? allStaffList
                            .filter((s) => s.dept === reportDept)
                            .map((s) => s.name)
                        : allStaffList.map((s) => s.name)
                      ).map((s) => ({ value: s, label: s }))}
                      placeholder="All Faculty"
                    />
                  </div>
                  {reportStaff && (
                    <div className="w-full sm:w-auto flex-[2] min-w-0 sm:min-w-[200px] animate-in fade-in duration-300 relative z-50">
                      <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-widest">
                        Subject
                      </label>
                      <CustomSelect
                        value={reportSubject}
                        onChange={(val) => setReportSubject(val)}
                        options={staffSubjects.map((s) => ({
                          value: s,
                          label: s,
                        }))}
                        placeholder="All Subjects"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!acadYear) {
                      notifyError("Academic Year is required before printing.");
                      return;
                    }
                    window.print();
                  }}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20 hover:from-indigo-700 hover:to-violet-700 font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 uppercase tracking-widest text-sm transition-all active:scale-95 w-full lg:w-auto mt-2"
                >
                  <Printer size={18} strokeWidth={2.5} /> Print Report
                </button>
              </div>
            </Card>

            <div
              className="flex justify-center mb-6 mt-2 print:hidden print-hide"
              style={{ "@media print": { display: "none" } }}
            >
              <div className="bg-white/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-sm border border-slate-200 inline-flex w-full md:w-auto">
                <button
                  onClick={() => setReportMode("faculty")}
                  className={`flex-1 md:w-48 py-3 text-sm font-bold rounded-xl transition-all ${reportMode === "faculty" ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Faculty Feedback
                </button>
                <button
                  onClick={() => setReportMode("exit")}
                  className={`flex-1 md:w-48 py-3 text-sm font-bold rounded-xl transition-all ${reportMode === "exit" ? "bg-emerald-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Course Exit Survey
                </button>
              </div>
            </div>

            {reportStaff && totalStudents > 0 && qCount > 0 ? (
              <>
                {/* --- OVERALL RATING DONUT CHART (Hidden when printing) --- */}
                {reportMode !== "institution" && (
                  <>
                    <Card className="p-8 border-slate-100 shadow-sm print:hidden">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                            <PieChart size={24} /> Overall Feedback Distribution
                          </h2>
                          <p className="text-sm text-slate-500 mt-2">
                            Rating distribution across {submittedStudents}{" "}
                            submitted feedback
                            {submittedStudents !== 1 ? "s" : ""}
                            {totalStudentsInClass > 0
                              ? ` out of ${totalStudentsInClass} students`
                              : ""}{" "}
                            and {activeQuestions.length} criteria
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-black text-blue-600">
                            {overallAverageOutOf5}
                          </div>
                          <p className="text-sm text-slate-500 font-semibold">
                            out of 5.0
                          </p>
                        </div>
                      </div>
                      <DonutChart
                        data={[
                          { name: "Excellent (5)", value: colTotals[5] },
                          { name: "Very Good (4)", value: colTotals[4] },
                          { name: "Good (3)", value: colTotals[3] },
                          { name: "Satisfactory (2)", value: colTotals[2] },
                          { name: "Poor (1)", value: colTotals[1] },
                        ]}
                        colors={[
                          "#22c55e",
                          "#3b82f6",
                          "#eab308",
                          "#f97316",
                          "#ef4444",
                        ]}
                        height={400}
                      />
                    </Card>

                    {/* --- QUESTION-WISE DONUT CHARTS (Hidden when printing) --- */}
                    <div className="mt-8 print:hidden">
                      <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-2">
                        <BarChart size={24} /> Question-wise Breakdown
                      </h2>
                      <p className="text-sm text-slate-600 mb-6">
                        Each donut chart shows the distribution of ratings for a
                        specific criterion. Hover over segments to see exact
                        counts.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                        {activeQuestions.map((q, idx) => (
                          <div className="" key={idx}>
                            <QuestionDonutChart
                              questionNumber={idx + 1}
                              questionText={q}
                              scoreCounts={scoreCounts[idx]}
                              totalResponses={totalStudents}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* --- OFFICIAL MSBTE K15 TABLE (Visible in browser AND in print mode) --- */}
                {reportMode === "faculty" && (
                  <div className="bg-white p-8 md:p-12 border border-slate-300 print:border-none print:p-0 print:m-0 w-full overflow-x-auto print:overflow-visible text-black mt-8 print:mt-0">
                    <div className="text-center font-bold mb-4 border-b-2 border-black pb-4 relative">
                      <h3 className="text-sm">
                        Maharashtra State Board of Technical Education
                      </h3>
                      <h2 className="text-lg mt-1">STUDENT FEEDBACK</h2>
                      <p className="absolute right-0 top-0 font-bold text-sm">
                        K15
                      </p>
                    </div>
                    <div className="text-sm font-bold space-y-2 border-b-2 border-black pb-4 mb-4 print:pb-2 print:mb-2 print:space-y-1">
                      <p>
                        Institute Name: Solapur Education Society's Polytechnic,
                        Solapur
                      </p>
                      <div className="border-t border-black my-2 print:my-0.5"></div>
                      <p>Academic Year :- {acadYear}</p>
                      <div className="border-t border-black my-2 print:my-0.5"></div>
                      <div className="flex justify-between">
                        <p>Programme: {user.dept}</p>
                        <p>Semester: {semester}</p>
                        <p>Date :- {new Date().toLocaleDateString("en-GB")}</p>
                      </div>
                      <div className="border-t border-black my-2 print:my-0.5"></div>
                      <p className="pt-2 print:pt-1">
                        Name Of The Faculty :- {reportStaff}{" "}
                        {reportSubject ? `(${reportSubject})` : ""}
                      </p>
                    </div>
                    <table className="w-full text-xs print:text-[10px] border-collapse border border-black text-center mt-4 print:mt-2">
                      <thead>
                        <tr className="font-bold bg-slate-50 print:bg-transparent">
                          <th className="border border-black p-2 print:py-1 print:px-1 w-10">
                            Sr.
                            <br />
                            No.
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 text-left">
                            Parameter
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 w-16">
                            <span className="print:hidden">5 - Excellent</span>
                            <span className="hidden print:inline">5 - Exc</span>
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 w-16">
                            <span className="print:hidden">4 - Very Good</span>
                            <span className="hidden print:inline">4 - VG</span>
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 w-16">
                            3 - Good
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 w-16">
                            <span className="print:hidden">
                              2 - Satisfactory
                            </span>
                            <span className="hidden print:inline">2 - Sat</span>
                          </th>
                          <th className="border border-black p-2 print:py-1 print:px-1 w-16">
                            <span className="print:hidden">
                              1 - Not Satisfactory
                            </span>
                            <span className="hidden print:inline">
                              1 - Not Sat
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {FEEDBACK_QUESTIONS.map((q, idx) => (
                          <tr key={idx}>
                            <td className="border border-black p-1.5 print:p-0.5 font-bold">
                              {idx + 1}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5 text-left font-semibold">
                              {q}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5">
                              {scoreCounts[idx][5]}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5">
                              {scoreCounts[idx][4]}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5">
                              {scoreCounts[idx][3]}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5">
                              {scoreCounts[idx][2]}
                            </td>
                            <td className="border border-black p-1.5 print:p-0.5">
                              {scoreCounts[idx][1]}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-bold">
                          <td
                            colSpan="2"
                            className="border border-black p-1.5 print:p-0.5 text-right"
                          >
                            Count
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colTotals[5]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colTotals[4]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colTotals[3]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colTotals[2]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colTotals[1]}
                          </td>
                        </tr>
                        <tr className="font-bold">
                          <td
                            colSpan="2"
                            className="border border-black p-1.5 print:p-0.5 text-right"
                          >
                            Total Score
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colScores[5]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colScores[4]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colScores[3]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colScores[2]}
                          </td>
                          <td className="border border-black p-1.5 print:p-0.5">
                            {colScores[1]}
                          </td>
                        </tr>
                        <tr className="font-bold bg-slate-100 print:bg-transparent">
                          <td
                            colSpan="6"
                            className="border border-black p-3 print:py-1.5 print:px-2 text-right text-sm print:text-xs"
                          >
                            Average Marks Obtained out of 25
                          </td>
                          <td className="border border-black p-3 print:py-1.5 print:px-2 text-sm print:text-xs">
                            {marksOutOf25}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="mt-12 flex justify-end pr-12 font-bold text-sm print:mt-28">
                      <div className="text-left border-black p-4">
                        <p>Signature of HoD :- ________________</p>
                        <p className="mt-4">Name :- {user.name}</p>
                      </div>
                    </div>
                  </div>
                )}

                {reportMode === "exit" && (
                  <div className="bg-white p-8 md:p-12 border border-slate-300 print:border-none print:p-0 print:m-0 w-full overflow-x-auto print:overflow-visible text-black mt-8 print:mt-0 uppercase">
                    <div className="text-center font-bold mb-4 border-b-2 border-black pb-4 relative">
                      <h3 className="text-sm">
                        Maharashtra State Board of Technical Education
                      </h3>
                      <h2 className="text-lg mt-1">
                        COURSE EXIT SURVEY REPORT
                      </h2>
                    </div>
                    <div className="text-sm font-bold space-y-2 border-b-2 border-black pb-4 mb-4">
                      <p>
                        Institute Name: Solapur Education Society&#39;s
                        Polytechnic, Solapur
                      </p>
                      <div className="border-t border-black my-2"></div>
                      <div className="flex justify-between">
                        <p>Course :- {reportSubject}</p>
                        <p>Academic Year :- {acadYear}</p>
                      </div>
                      <div className="border-t border-black my-2"></div>
                      <div className="flex justify-between">
                        <p>Programme: {user.dept}</p>
                        <p>Semester: {semester}</p>
                        <p>Date :- {new Date().toLocaleDateString("en-GB")}</p>
                      </div>
                      <div className="border-t border-black my-2"></div>
                      <p className="pt-2">
                        Name Of The Faculty :- {reportStaff}
                      </p>
                    </div>
                    <table className="w-full text-[11px] border-collapse border border-black text-center mt-4">
                      <thead>
                        <tr className="font-bold bg-slate-50 print:bg-transparent">
                          <th className="border border-black p-2 w-10">
                            Sr. No.
                          </th>
                          <th className="border border-black p-2 text-left">
                            Parameters (Course Outcomes)
                          </th>
                          <th className="border border-black p-2 w-14">
                            Excellent 5
                          </th>
                          <th className="border border-black p-2 w-14">
                            Very good 4
                          </th>
                          <th className="border border-black p-2 w-14">
                            Good 3
                          </th>
                          <th className="border border-black p-2 w-14">
                            Satisfactory 2
                          </th>
                          <th className="border border-black p-2 w-14">
                            Average 1
                          </th>
                          <th className="border border-black p-2 w-14">
                            Max. Marks
                          </th>
                          <th className="border border-black p-2 w-14">
                            TOTAL
                          </th>
                          <th className="border border-black p-2 w-14">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeQuestions.map((q, idx) => {
                          const rowTotal =
                            scoreCounts[idx][5] * 5 +
                            scoreCounts[idx][4] * 4 +
                            scoreCounts[idx][3] * 3 +
                            scoreCounts[idx][2] * 2 +
                            scoreCounts[idx][1] * 1;
                          const rowMax = totalStudents * 5;
                          const rowPerc =
                            rowMax > 0
                              ? ((rowTotal / rowMax) * 100).toFixed(1)
                              : "0.0";
                          return (
                            <tr key={idx}>
                              <td className="border border-black p-1.5 font-bold">
                                {idx + 1}
                              </td>
                              <td className="border border-black p-1.5 text-left font-semibold">
                                {q}
                              </td>
                              <td className="border border-black p-1.5">
                                {scoreCounts[idx][5]}
                              </td>
                              <td className="border border-black p-1.5">
                                {scoreCounts[idx][4]}
                              </td>
                              <td className="border border-black p-1.5">
                                {scoreCounts[idx][3]}
                              </td>
                              <td className="border border-black p-1.5">
                                {scoreCounts[idx][2]}
                              </td>
                              <td className="border border-black p-1.5">
                                {scoreCounts[idx][1]}
                              </td>
                              <td className="border border-black p-1.5 font-bold">
                                {rowMax}
                              </td>
                              <td className="border border-black p-1.5 font-bold">
                                {rowTotal}
                              </td>
                              <td className="border border-black p-1.5 font-bold">
                                {rowPerc}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-20 flex justify-end pr-12 font-bold text-sm">
                      <div className="text-left border-black p-4">
                        <p>Signature of HoD :- ________________</p>
                        <p className="mt-4">Name :- {user.name}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- K15 REPORT VISUALIZATION (Admin style charts - Hidden when printing) --- */}
                <div className="mt-12 print:hidden mb-12">
                  <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <PieChart size={24} />{" "}
                    {reportMode === "exit"
                      ? "Course Exit Analytics"
                      : "K-15 Report Visualization"}
                  </h2>
                  <div className="grid md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1 p-8 flex flex-col items-center justify-center border-indigo-100">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                        <PieChart size={18} className="text-indigo-600" /> Count
                        Distribution
                      </h3>
                      <div className="grid grid-cols-2 gap-2 w-full mb-6 text-center opacity-90">
                        <div className="bg-indigo-50 text-indigo-800 p-2 rounded-xl border border-indigo-100 font-bold text-xs flex flex-col justify-center items-center">
                          <span className="text-[9px] uppercase text-indigo-500 mb-0.5">
                            Total Score
                          </span>
                          <span className="font-black text-sm">
                            {grandTotalScore}
                          </span>
                        </div>
                        <div className="bg-blue-50 text-blue-800 p-2 rounded-xl border border-blue-100 font-bold text-xs flex flex-col justify-center items-center">
                          <span className="text-[9px] uppercase text-blue-500 mb-0.5">
                            Avg / 25
                          </span>
                          <span className="font-black text-sm">
                            {marksOutOf25}
                          </span>
                        </div>
                        {totalStudentsInClass > 0 && (
                          <>
                            <button
                              onClick={() => setShowSubmittedModal(true)}
                              type="button"
                              className="bg-green-50 text-green-800 p-2 rounded-xl border border-green-100 font-bold text-xs flex flex-col items-center justify-center hover:bg-green-100 transition-colors cursor-pointer shadow-sm group"
                            >
                              <span className="text-[9px] uppercase text-green-500 group-hover:text-green-600 mb-0.5">
                                Submitted
                              </span>
                              <span className="font-black text-sm">
                                {submittedStudents}
                              </span>
                            </button>
                            <button
                              onClick={() => setShowRemainingModal(true)}
                              type="button"
                              className="bg-red-50 text-red-800 p-2 rounded-xl border border-red-100 font-bold text-xs flex flex-col items-center justify-center hover:bg-red-100 transition-colors cursor-pointer shadow-sm group"
                            >
                              <span className="text-[9px] uppercase text-red-500 group-hover:text-red-600 mb-0.5">
                                Pending
                              </span>
                              <span className="font-black text-sm">
                                {remainingStudents}
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                      <div className="w-full relative">
                        <DonutChart
                          data={[
                            { name: "Excellent (5)", value: colTotals[5] },
                            { name: "Very Good (4)", value: colTotals[4] },
                            { name: "Good (3)", value: colTotals[3] },
                            { name: "Satisfactory (2)", value: colTotals[2] },
                            { name: "Poor (1)", value: colTotals[1] },
                          ]}
                          colors={[
                            "#22c55e",
                            "#3b82f6",
                            "#eab308",
                            "#f97316",
                            "#ef4444",
                          ]}
                          height={300}
                        />
                      </div>
                    </Card>
                    <Card className="md:col-span-2 p-8 border-indigo-100">
                      <div className="flex justify-between items-end mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                          <BarChart size={18} className="text-indigo-600" />{" "}
                          Parameter Averages
                        </h3>
                        <h2 className="text-3xl font-black text-indigo-700">
                          {overallAverageOutOf5}{" "}
                          <span className="text-sm text-slate-400">/ 5.0</span>
                        </h2>
                      </div>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-4">
                        {activeQuestions.map((q, idx) => {
                          const qTotalScore =
                            scoreCounts[idx][5] * 5 +
                            scoreCounts[idx][4] * 4 +
                            scoreCounts[idx][3] * 3 +
                            scoreCounts[idx][2] * 2 +
                            scoreCounts[idx][1] * 1;
                          const qAvg = Math.round(qTotalScore / totalStudents);
                          const widthPercent = (qAvg / 5) * 100;
                          const numAvg = qAvg;
                          const barColor =
                            numAvg >= 4.5
                              ? "bg-green-500"
                              : numAvg >= 3.5
                                ? "bg-blue-500"
                                : numAvg >= 2.5
                                  ? "bg-yellow-500"
                                  : numAvg >= 1.5
                                    ? "bg-orange-500"
                                    : "bg-red-500";
                          return (
                            <div key={idx} className="relative">
                              <div className="flex justify-between items-start text-xs md:text-[13px] font-bold text-slate-700 mb-1.5 gap-4">
                                <span className="leading-snug">
                                  {idx + 1}. {q}
                                </span>
                                <span className="shrink-0 font-black text-slate-800">
                                  {qAvg}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${barColor}`}
                                  style={{ width: `${widthPercent}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                </div>
              </>
            ) : reportStaff ? (
              <div className="text-center py-20 opacity-30">
                <h2 className="text-2xl font-black uppercase">
                  {reportMode === "exit" && !reportSubject
                    ? "Select a subject to view Course Exit Analytics"
                    : "No Data Available"}
                </h2>
              </div>
            ) : (
              <div className="text-center py-20 opacity-30">
                <h2 className="text-2xl font-black uppercase">
                  Select a faculty to generate report
                </h2>
              </div>
            )}
          </div>
        )}

        {/* CONTROLS TAB (YOUR CODE) */}
        {activeTab === "controls" && (
          <Card className="p-12 text-center border-slate-100 shadow-sm print:hidden animate-in slide-in-from-bottom-4 duration-500 relative overflow-hidden bg-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-slate-100 rounded-full blur-3xl opacity-50 -z-10"></div>
            <div className="mb-10 inline-flex p-4 rounded-3xl bg-slate-50 ring-1 ring-slate-200/50 shadow-inner text-slate-400">
              <Settings size={48} strokeWidth={1} />
            </div>
            <h2 className="text-3xl font-extrabold mb-3 uppercase text-slate-800 tracking-tight">
              Portal Security Controls
            </h2>
            <p className="text-slate-500 font-medium mb-10 max-w-md mx-auto">
              Toggle the global student and staff portal states. When closed,
              the respective users will not be able to log in or submit/view
              feedback.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 sm:justify-center">
              <button
                onClick={async () => {
                  const s = !isPortalOpen;
                  await setDoc(
                    doc(db, "Settings", "Global"),
                    { studentPortalOpen: s },
                    { merge: true },
                  );
                  setIsPortalOpen(s);
                }}
                className={`px-10 py-4 rounded-2xl font-bold text-lg text-white transition-all shadow-xl active:scale-95 uppercase tracking-wide flex items-center justify-center mx-auto gap-3 ${isPortalOpen ? "bg-gradient-to-b from-red-500 to-rose-600 shadow-red-500/30 hover:shadow-red-500/50" : "bg-gradient-to-b from-emerald-500 to-teal-600 shadow-emerald-500/30 hover:shadow-emerald-500/50"}`}
              >
                {isPortalOpen
                  ? "Close Portal for Students"
                  : "Open Portal for Students"}
              </button>

              <button
                onClick={async () => {
                  const s = !isStaffPortalOpen;
                  await setDoc(
                    doc(db, "Settings", "Global"),
                    { staffPortalOpen: s },
                    { merge: true },
                  );
                  setIsStaffPortalOpen(s);
                }}
                className={`px-10 py-4 rounded-2xl font-bold text-lg text-white transition-all shadow-xl active:scale-95 uppercase tracking-wide flex items-center justify-center mx-auto gap-3 ${
                  isStaffPortalOpen
                    ? "bg-gradient-to-b from-red-500 to-rose-600 shadow-red-500/30 hover:shadow-red-500/50"
                    : "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-violet-500/30 hover:shadow-violet-500/50"
                }`}
              >
                {isStaffPortalOpen
                  ? "Close Portal for Staff"
                  : "Open Portal for Staff"}
              </button>
            </div>
          </Card>
        )}

        {/* REMAINING STUDENTS MODAL */}
        {showRemainingModal &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                backgroundColor: "rgba(15,23,42,0.75)",
                backdropFilter: "blur(5px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "24px",
                  width: "90%",
                  maxWidth: "500px",
                  minHeight: "250px",
                  color: "#0f172a",
                  zIndex: 999999,
                  position: "relative",
                  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "2px solid #f1f5f9",
                    paddingBottom: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "800",
                      margin: 0,
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Users size={24} /> Remaining Students
                  </h3>
                  <button
                    onClick={() => setShowRemainingModal(false)}
                    style={{
                      background: "#f1f5f9",
                      color: "#64748b",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Close ✕
                  </button>
                </div>
                <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                  {remainingStudentsList.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 0",
                        opacity: 0.6,
                      }}
                    >
                      <p style={{ fontWeight: "bold" }}>
                        All students have submitted!
                      </p>
                    </div>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {remainingStudentsList.map((s, idx) => (
                        <li
                          key={idx}
                          style={{
                            padding: "12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "#f8fafc",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "bold",
                                fontSize: "14px",
                                color: "#1e293b",
                              }}
                            >
                              {s.name}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginTop: "4px",
                              }}
                            >
                              {s.enrollmentNo || s.rollNo} • Div{" "}
                              {s.division || "A"}
                            </span>
                          </div>
                          <span
                            style={{
                              backgroundColor: "#fee2e2",
                              color: "#e11d48",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: "900",
                              textTransform: "uppercase",
                            }}
                          >
                            Pending
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* SUBMITTED STUDENTS MODAL */}
        {showSubmittedModal &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                backgroundColor: "rgba(15,23,42,0.75)",
                backdropFilter: "blur(5px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "24px",
                  width: "90%",
                  maxWidth: "500px",
                  minHeight: "250px",
                  color: "#0f172a",
                  zIndex: 999999,
                  position: "relative",
                  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "2px solid #f1f5f9",
                    paddingBottom: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "800",
                      margin: 0,
                      color: "#10b981",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Activity size={24} /> Submitted Students
                  </h3>
                  <button
                    onClick={() => setShowSubmittedModal(false)}
                    style={{
                      background: "#f1f5f9",
                      color: "#64748b",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Close ✕
                  </button>
                </div>
                <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                  {submittedStudentsList.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 0",
                        opacity: 0.6,
                      }}
                    >
                      <p style={{ fontWeight: "bold" }}>
                        No students have submitted yet.
                      </p>
                    </div>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {submittedStudentsList.map((s, idx) => (
                        <li
                          key={idx}
                          style={{
                            padding: "12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "#f8fafc",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "bold",
                                fontSize: "14px",
                                color: "#1e293b",
                              }}
                            >
                              {s.name}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginTop: "4px",
                              }}
                            >
                              {s.enrollmentNo || s.rollNo} • Div{" "}
                              {s.division || "A"}
                            </span>
                          </div>
                          <span
                            style={{
                              backgroundColor: "#d1fae5",
                              color: "#059669",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: "900",
                              textTransform: "uppercase",
                            }}
                          >
                            Submitted
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </>
  );
}
