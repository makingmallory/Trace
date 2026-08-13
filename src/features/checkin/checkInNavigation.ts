export function shouldReturnHomeAfterCompletion(historical: boolean, wasCompleted: boolean, completed: boolean): boolean {
  return completed && !historical && !wasCompleted
}
