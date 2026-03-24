const Database = require('better-sqlite3');
const {
  inicializarTablas,
  getYears, addYear, updateYear, deleteYear,
  getYearData, addIncome, deleteIncome, addExpense, deleteExpense,
  addGoal, updateGoal, deleteGoal, addGoalTransaction, deleteGoalTransaction,
  addGlobalWithdrawal,
  getCustomFunds, addCustomFund, updateCustomFund, deleteCustomFund,
  getSettings, saveSetting,
} = require('../app/database');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  inicializarTablas(db);
});

afterEach(() => {
  db.close();
});

// ─── YEARS ────────────────────────────────────────────────────────────────────

describe('Years', () => {
  test('addYear inserta un año y getYears lo devuelve', () => {
    addYear(db, 2025);
    expect(getYears(db)).toEqual([2025]);
  });

  test('getYears devuelve los años ordenados DESC', () => {
    addYear(db, 2024);
    addYear(db, 2026);
    addYear(db, 2025);
    expect(getYears(db)).toEqual([2026, 2025, 2024]);
  });

  test('addYear ignora duplicados (INSERT OR IGNORE)', () => {
    addYear(db, 2025);
    addYear(db, 2025);
    expect(getYears(db)).toHaveLength(1);
  });

  test('updateYear renombra el año y migra todos sus datos', () => {
    addYear(db, 2024);
    addIncome(db, { id: 'i1', year: 2024, month: 'enero', amount: 1000, description: 'Salario', dest: null, destLabel: null });
    addExpense(db, { id: 'e1', year: 2024, month: 'enero', type: 'mensual', amount: 500, description: 'Alquiler', category: 'Vivienda', goalId: null });

    updateYear(db, 2024, 2025);

    expect(getYears(db)).toEqual([2025]);
    const data = getYearData(db, 2025);
    expect(data.incomes).toHaveLength(1);
    expect(data.expenses).toHaveLength(1);
    expect(getYearData(db, 2024).incomes).toHaveLength(0);
  });

  test('deleteYear borra el año y todos sus datos en cascada', () => {
    addYear(db, 2025);
    addIncome(db, { id: 'i1', year: 2025, month: 'enero', amount: 1000, description: 'Salario', dest: null, destLabel: null });
    addGoal(db, { id: 'g1', year: 2025, name: 'Meta', targetAmount: 5000, currentAmount: 0 });
    addGoalTransaction(db, { id: 'gt1', goalId: 'g1', amount: 100, description: 'Aportación', date: '2025-01-15', isLinkedExpense: false });

    deleteYear(db, 2025);

    expect(getYears(db)).toHaveLength(0);
    const data = getYearData(db, 2025);
    expect(data.incomes).toHaveLength(0);
    expect(data.investmentGoals).toHaveLength(0);
    // Las transacciones de la meta también deben haberse borrado
    const txs = db.prepare('SELECT * FROM goal_transactions WHERE goalId = ?').all('g1');
    expect(txs).toHaveLength(0);
  });
});

// ─── INCOMES & EXPENSES ───────────────────────────────────────────────────────

describe('Incomes', () => {
  beforeEach(() => addYear(db, 2025));

  test('addIncome inserta un ingreso y getYearData lo devuelve', () => {
    addIncome(db, { id: 'i1', year: 2025, month: 'enero', amount: 1500, description: 'Salario', dest: 'ahorro', destLabel: 'Ahorro' });
    const { incomes } = getYearData(db, 2025);
    expect(incomes).toHaveLength(1);
    expect(incomes[0]).toMatchObject({ id: 'i1', amount: 1500, description: 'Salario' });
  });

  test('deleteIncome elimina únicamente el ingreso indicado', () => {
    addIncome(db, { id: 'i1', year: 2025, month: 'enero', amount: 1500, description: 'Salario', dest: null, destLabel: null });
    addIncome(db, { id: 'i2', year: 2025, month: 'enero', amount: 200, description: 'Extra', dest: null, destLabel: null });
    deleteIncome(db, 'i1');
    const { incomes } = getYearData(db, 2025);
    expect(incomes).toHaveLength(1);
    expect(incomes[0].id).toBe('i2');
  });
});

describe('Expenses', () => {
  beforeEach(() => addYear(db, 2025));

  test('addExpense inserta un gasto y getYearData lo devuelve', () => {
    addExpense(db, { id: 'e1', year: 2025, month: 'enero', type: 'mensual', amount: 800, description: 'Alquiler', category: 'Vivienda', goalId: null });
    const { expenses } = getYearData(db, 2025);
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ id: 'e1', amount: 800, category: 'Vivienda' });
  });

  test('deleteExpense elimina únicamente el gasto indicado', () => {
    addExpense(db, { id: 'e1', year: 2025, month: 'enero', type: 'mensual', amount: 800, description: 'Alquiler', category: 'Vivienda', goalId: null });
    addExpense(db, { id: 'e2', year: 2025, month: 'enero', type: 'personal', amount: 50, description: 'Gym', category: 'Salud', goalId: null });
    deleteExpense(db, 'e1');
    const { expenses } = getYearData(db, 2025);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].id).toBe('e2');
  });
});

// ─── INVESTMENT GOALS ─────────────────────────────────────────────────────────

describe('Investment Goals', () => {
  beforeEach(() => addYear(db, 2025));

  test('addGoal inserta una meta y getYearData la devuelve', () => {
    addGoal(db, { id: 'g1', year: 2025, name: 'Vacaciones', targetAmount: 2000, currentAmount: 0 });
    const { investmentGoals } = getYearData(db, 2025);
    expect(investmentGoals).toHaveLength(1);
    expect(investmentGoals[0]).toMatchObject({ id: 'g1', name: 'Vacaciones', targetAmount: 2000 });
  });

  test('updateGoal actualiza nombre e importes de la meta', () => {
    addGoal(db, { id: 'g1', year: 2025, name: 'Vacaciones', targetAmount: 2000, currentAmount: 0 });
    updateGoal(db, { id: 'g1', name: 'Vacaciones 2025', targetAmount: 3000, currentAmount: 500 });
    const { investmentGoals } = getYearData(db, 2025);
    expect(investmentGoals[0]).toMatchObject({ name: 'Vacaciones 2025', targetAmount: 3000, currentAmount: 500 });
  });

  test('deleteGoal borra la meta y sus transacciones en cascada', () => {
    addGoal(db, { id: 'g1', year: 2025, name: 'Meta', targetAmount: 5000, currentAmount: 0 });
    addGoalTransaction(db, { id: 'gt1', goalId: 'g1', amount: 200, description: 'Primera aportación', date: '2025-02-01', isLinkedExpense: false });
    deleteGoal(db, 'g1');
    const { investmentGoals } = getYearData(db, 2025);
    expect(investmentGoals).toHaveLength(0);
    const txs = db.prepare('SELECT * FROM goal_transactions WHERE goalId = ?').all('g1');
    expect(txs).toHaveLength(0);
  });

  test('addGoalTransaction se incluye dentro de getYearData con isLinkedExpense como booleano', () => {
    addGoal(db, { id: 'g1', year: 2025, name: 'Meta', targetAmount: 5000, currentAmount: 0 });
    addGoalTransaction(db, { id: 'gt1', goalId: 'g1', amount: 300, description: 'Aportación', date: '2025-03-10', isLinkedExpense: true });
    const { investmentGoals } = getYearData(db, 2025);
    expect(investmentGoals[0].transactions).toHaveLength(1);
    expect(investmentGoals[0].transactions[0].isLinkedExpense).toBe(true);
  });

  test('deleteGoalTransaction elimina únicamente la transacción indicada', () => {
    addGoal(db, { id: 'g1', year: 2025, name: 'Meta', targetAmount: 5000, currentAmount: 0 });
    addGoalTransaction(db, { id: 'gt1', goalId: 'g1', amount: 100, description: 'Primera', date: '2025-01-01', isLinkedExpense: false });
    addGoalTransaction(db, { id: 'gt2', goalId: 'g1', amount: 200, description: 'Segunda', date: '2025-02-01', isLinkedExpense: false });
    deleteGoalTransaction(db, 'gt1');
    const { investmentGoals } = getYearData(db, 2025);
    expect(investmentGoals[0].transactions).toHaveLength(1);
    expect(investmentGoals[0].transactions[0].id).toBe('gt2');
  });
});

// ─── GLOBAL WITHDRAWALS ───────────────────────────────────────────────────────

describe('Global Withdrawals', () => {
  beforeEach(() => addYear(db, 2025));

  test('addGlobalWithdrawal inserta y getYearData la devuelve', () => {
    addGlobalWithdrawal(db, { id: 'w1', year: 2025, month: 'marzo', amount: 500, date: '2025-03-15' });
    const { globalWithdrawals } = getYearData(db, 2025);
    expect(globalWithdrawals).toHaveLength(1);
    expect(globalWithdrawals[0]).toMatchObject({ id: 'w1', amount: 500 });
  });
});

// ─── CUSTOM FUNDS ─────────────────────────────────────────────────────────────

describe('Custom Funds', () => {
  test('addCustomFund inserta y getCustomFunds lo devuelve', () => {
    addCustomFund(db, { id: 'f1', name: 'Emergencias', amount: 1000, isDefault: false });
    const funds = getCustomFunds(db);
    expect(funds).toHaveLength(1);
    expect(funds[0]).toMatchObject({ id: 'f1', name: 'Emergencias', amount: 1000, isDefault: false });
  });

  test('getCustomFunds convierte isDefault a booleano', () => {
    addCustomFund(db, { id: 'f1', name: 'Principal', amount: 0, isDefault: true });
    addCustomFund(db, { id: 'f2', name: 'Secundario', amount: 0, isDefault: false });
    const funds = getCustomFunds(db);
    const principal = funds.find(f => f.id === 'f1');
    const secundario = funds.find(f => f.id === 'f2');
    expect(principal.isDefault).toBe(true);
    expect(secundario.isDefault).toBe(false);
  });

  test('updateCustomFund actualiza los datos del fondo', () => {
    addCustomFund(db, { id: 'f1', name: 'Emergencias', amount: 1000, isDefault: false });
    updateCustomFund(db, { id: 'f1', name: 'Colchón', amount: 2000, isDefault: false });
    const funds = getCustomFunds(db);
    expect(funds[0]).toMatchObject({ name: 'Colchón', amount: 2000 });
  });

  test('updateCustomFund con isDefault=true resetea el isDefault del resto', () => {
    addCustomFund(db, { id: 'f1', name: 'Principal', amount: 0, isDefault: true });
    addCustomFund(db, { id: 'f2', name: 'Secundario', amount: 0, isDefault: false });
    updateCustomFund(db, { id: 'f2', name: 'Secundario', amount: 0, isDefault: true });
    const funds = getCustomFunds(db);
    const f1 = funds.find(f => f.id === 'f1');
    const f2 = funds.find(f => f.id === 'f2');
    expect(f1.isDefault).toBe(false);
    expect(f2.isDefault).toBe(true);
  });

  test('deleteCustomFund elimina el fondo indicado', () => {
    addCustomFund(db, { id: 'f1', name: 'Emergencias', amount: 1000, isDefault: false });
    addCustomFund(db, { id: 'f2', name: 'Vacaciones', amount: 500, isDefault: false });
    deleteCustomFund(db, 'f1');
    const funds = getCustomFunds(db);
    expect(funds).toHaveLength(1);
    expect(funds[0].id).toBe('f2');
  });
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

describe('Settings', () => {
  test('saveSetting inserta un ajuste y getSettings lo devuelve', () => {
    saveSetting(db, 'theme', 'dark');
    const settings = getSettings(db);
    expect(settings.theme).toBe('dark');
  });

  test('saveSetting actualiza un ajuste existente (UPSERT)', () => {
    saveSetting(db, 'theme', 'dark');
    saveSetting(db, 'theme', 'light');
    const settings = getSettings(db);
    expect(settings.theme).toBe('light');
  });

  test('getSettings parsea valores JSON automáticamente', () => {
    saveSetting(db, 'config', { activeModo: 'beca', amount: 500 });
    const settings = getSettings(db);
    expect(settings.config).toEqual({ activeModo: 'beca', amount: 500 });
  });

  test('getSettings devuelve objeto vacío si no hay ajustes', () => {
    expect(getSettings(db)).toEqual({});
  });
});
