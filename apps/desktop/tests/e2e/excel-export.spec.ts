import { expect, test } from "@playwright/test";

import { exportStudentsWorkbook } from "../../src/lib/services/excel-export";

const now = "2026-07-10T12:00:00.000Z";

test("grade export carries the selected stage books, issued marker, and Arabic RTL layout", () => {
  const workbook = exportStudentsWorkbook({
    students: [
      {
        id: "student-1",
        scopeId: "global",
        name: "Mona Ahmed",
        governmentId: "29801011234567",
        educationStage: "primary",
        gradeLevel: "primary1",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    books: [
      {
        id: "book-1",
        scopeId: "global",
        name: "Primary Math",
        educationStage: "primary",
        quantity: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    selectedStage: "primary",
    selectedGradeLevel: "primary1",
    language: "ar",
    issuedBookIdsByStudentId: { "student-1": ["book-1"] },
  });

  const worksheet = workbook.getWorksheet("Students");
  expect(worksheet?.views[0]?.rightToLeft).toBe(true);
  expect(worksheet?.getCell("A6").value).toBe("Mona Ahmed");
  expect(worksheet?.getCell("B6").value).toBe("تم التسليم");
});
