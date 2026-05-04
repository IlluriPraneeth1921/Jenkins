Target application: Django Todo sample in this repository.

Application URL
- Base URL: http://127.0.0.1:8000
- Main page: /todos

Business requirements
1. A user can view the todo list page.
2. A user can add a new todo by entering a title and clicking Add.
3. A newly created todo should appear in the list.
4. A user can mark a todo as completed by clicking the checkbox.
5. A completed todo should remain visible and appear with completed styling.
6. A user can delete a todo.
7. Submitting an empty todo title should not be allowed.
8. Regression coverage should include both happy-path and negative scenarios.

Non-functional expectations
- The generated tests should use Playwright with TypeScript.
- Tests should use resilient locators where possible.
- Failures should be summarized in a report that can be shared with stakeholders.
