## AI-Generated Test Cases: Todo Application

### TC-001 - Load the todo list page
- Objective: Verify the list page loads successfully.
- Preconditions: The application is running and reachable.
- Steps:
  1. Open the todo list page.
  2. Verify the page title and add form are visible.
- Expected Result:
  - The page heading "Todo List - Abhishek" is displayed.
  - The title input and Add button are visible.

### TC-002 - Add a new todo item
- Objective: Verify a user can create a new todo.
- Preconditions: The application is running and reachable.
- Steps:
  1. Open the todo list page.
  2. Enter a unique title in the add-todo input.
  3. Submit the form.
- Expected Result:
  - The new todo title is visible in the list.

### TC-003 - Toggle a todo item as completed
- Objective: Verify a user can mark a todo completed.
- Preconditions: At least one todo item exists.
- Steps:
  1. Open the todo list page.
  2. Select the first todo item's completion checkbox.
- Expected Result:
  - The checkbox becomes checked.
  - The todo item receives completed styling.

### TC-004 - Delete a todo item
- Objective: Verify a user can delete a todo.
- Preconditions: At least one todo item exists.
- Steps:
  1. Open the todo list page.
  2. Create a temporary todo if needed.
  3. Click the delete icon for the target todo.
- Expected Result:
  - The deleted todo no longer appears in the list.
