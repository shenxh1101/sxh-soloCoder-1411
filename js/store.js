const Store = (function() {
    const STORAGE_KEY = 'workOrderSchedules';
    const CURRENT_SCHEME_KEY = 'currentScheduleScheme';
    const CALENDAR_KEY = 'productionCalendar';
    const AUDIT_LOG_KEY = 'scheduleAuditLog';
    const EXECUTION_KEY = 'workOrderExecution';

    const ORDER_STATUS = {
        PENDING: 'pending',
        SCHEDULED: 'scheduled',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };

    const STATUS_LABELS = {
        pending: '待排程',
        scheduled: '已排程',
        in_progress: '已开工',
        completed: '已完成',
        cancelled: '已取消'
    };

    const STATUS_COLORS = {
        pending: '#9aa4bd',
        scheduled: '#00d4ff',
        in_progress: '#ff9500',
        completed: '#34c759',
        cancelled: '#ff3b30'
    };

    const AUDIT_ACTION_TYPES = {
        ORDER_MOVE: 'order_move',
        ORDER_STATUS_CHANGE: 'order_status_change',
        ORDER_EDIT: 'order_edit',
        ORDER_ADD: 'order_add',
        ORDER_DELETE: 'order_delete',
        SCHEME_SWITCH: 'scheme_switch',
        SCHEME_SAVE: 'scheme_save',
        SCHEME_COPY: 'scheme_copy',
        SCHEME_DELETE: 'scheme_delete',
        AUTO_SCHEDULE: 'auto_schedule',
        CALENDAR_UPDATE: 'calendar_update'
    };

    const AUDIT_ACTION_LABELS = {
        order_move: '挪动工单',
        order_status_change: '状态变更',
        order_edit: '编辑工单',
        order_add: '添加工单',
        order_delete: '删除工单',
        scheme_switch: '切换方案',
        scheme_switch_to: '切换到方案',
        scheme_save: '保存方案',
        scheme_copy: '复制方案',
        scheme_delete: '删除方案',
        auto_schedule: '自动排程',
        calendar_update: '日历更新'
    };

    const SHIFT_TYPES = {
        SINGLE: 'single',
        DOUBLE: 'double',
        TRIPLE: 'triple',
        CUSTOM: 'custom'
    };

    const DEFAULT_SHIFTS = {
        single: [
            { id: 'day', name: '白班', startMinute: 480, endMinute: 1080 }
        ],
        double: [
            { id: 'day', name: '早班', startMinute: 480, endMinute: 780 },
            { id: 'night', name: '晚班', startMinute: 780, endMinute: 1080 }
        ],
        triple: [
            { id: 'morning', name: '早班', startMinute: 480, endMinute: 720 },
            { id: 'afternoon', name: '中班', startMinute: 720, endMinute: 960 },
            { id: 'evening', name: '晚班', startMinute: 960, endMinute: 1200 }
        ]
    };

    const LINES = [
        { id: 'lineA', name: 'A线', color: '#00d4ff', shiftType: 'single' },
        { id: 'lineB', name: 'B线', color: '#ff9500', shiftType: 'single' },
        { id: 'lineC', name: 'C线', color: '#34c759', shiftType: 'single' }
    ];

    const DEFAULT_CALENDAR = {
        workDays: [1, 2, 3, 4, 5],
        downtimePeriods: [],
        workStartTime: 480,
        workEndTime: 1080,
        shiftType: 'single',
        customShifts: [],
        breakPeriods: [
            { id: Utils.generateUUID(), name: '午餐', startMinute: 720, endMinute: 780, recurring: true }
        ]
    };

    let state = {
        workOrders: [],
        currentSchemeId: null,
        schemes: [],
        calendar: null,
        auditLogs: [],
        executionData: {}
    };

    function init() {
        loadCalendar();
        loadAuditLogs();
        loadExecutionData();
        loadFromStorage();
        if (state.schemes.length === 0) {
            createDemoData();
        }
        migrateOrders();
    }

    function loadCalendar() {
        try {
            const stored = localStorage.getItem(CALENDAR_KEY);
            if (stored) {
                state.calendar = { ...DEFAULT_CALENDAR, ...JSON.parse(stored) };
                if (!state.calendar.breakPeriods) {
                    state.calendar.breakPeriods = DEFAULT_CALENDAR.breakPeriods;
                }
            } else {
                state.calendar = Utils.deepClone(DEFAULT_CALENDAR);
                saveCalendar();
            }
        } catch (e) {
            console.error('加载日历失败:', e);
            state.calendar = Utils.deepClone(DEFAULT_CALENDAR);
        }
    }

    function saveCalendar() {
        try {
            localStorage.setItem(CALENDAR_KEY, JSON.stringify(state.calendar));
        } catch (e) {
            console.error('保存日历失败:', e);
        }
    }

    function loadAuditLogs() {
        try {
            const stored = localStorage.getItem(AUDIT_LOG_KEY);
            const loaded = stored ? JSON.parse(stored) : [];
            state.auditLogs = (Array.isArray(loaded) ? loaded : []).filter(
                l => l && typeof l === 'object' && l.actionType
            );
        } catch (e) {
            console.error('加载审计日志失败:', e);
            state.auditLogs = [];
        }
    }

    function saveAuditLogs() {
        try {
            const recentLogs = state.auditLogs.slice(-500);
            localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(recentLogs));
        } catch (e) {
            console.error('保存审计日志失败:', e);
        }
    }

    function loadExecutionData() {
        try {
            const stored = localStorage.getItem(EXECUTION_KEY);
            state.executionData = stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.error('加载执行数据失败:', e);
            state.executionData = {};
        }
    }

    function saveExecutionData() {
        try {
            localStorage.setItem(EXECUTION_KEY, JSON.stringify(state.executionData));
        } catch (e) {
            console.error('保存执行数据失败:', e);
        }
    }

    function addAuditLog(actionType, details = {}) {
        const log = {
            id: Utils.generateUUID(),
            timestamp: Date.now(),
            actionType: actionType,
            actionLabel: AUDIT_ACTION_LABELS[actionType] || actionType,
            operator: '计划员',
            schemeId: state.currentSchemeId,
            schemeName: getCurrentScheme()?.name || null,
            details: details
        };
        state.auditLogs.push(log);
        saveAuditLogs();
        return log;
    }

    function getAuditLogs(filter = {}) {
        let logs = [...state.auditLogs]
            .filter(l => l && typeof l === 'object' && l.actionType)
            .reverse();
        
        if (filter.actionType) {
            logs = logs.filter(l => l.actionType === filter.actionType);
        }
        if (filter.schemeId) {
            logs = logs.filter(l => l.schemeId === filter.schemeId);
        }
        if (filter.startTime) {
            logs = logs.filter(l => l.timestamp >= filter.startTime);
        }
        if (filter.endTime) {
            logs = logs.filter(l => l.timestamp <= filter.endTime);
        }
        
        return logs;
    }

    function getCalendar() {
        return state.calendar;
    }

    function updateCalendar(updates) {
        state.calendar = { ...state.calendar, ...updates };
        saveCalendar();
        addAuditLog(AUDIT_ACTION_TYPES.CALENDAR_UPDATE, { updates });
        return state.calendar;
    }

    function getShifts(lineId = null) {
        const shiftType = state.calendar.shiftType;
        if (shiftType === 'custom' && state.calendar.customShifts.length > 0) {
            return state.calendar.customShifts;
        }
        return DEFAULT_SHIFTS[shiftType] || DEFAULT_SHIFTS.single;
    }

    function getActiveShiftAt(minuteOfDay, lineId = null) {
        const shifts = getShifts(lineId);
        for (const shift of shifts) {
            if (minuteOfDay >= shift.startMinute && minuteOfDay < shift.endMinute) {
                return shift;
            }
        }
        return null;
    }

    function isInBreakTime(minuteOfDay, dateStr = null) {
        for (const bp of state.calendar.breakPeriods) {
            if (minuteOfDay >= bp.startMinute && minuteOfDay < bp.endMinute) {
                return true;
            }
        }
        return false;
    }

    function isInAnyShift(minuteOfDay) {
        const shifts = getShifts();
        for (const shift of shifts) {
            if (minuteOfDay >= shift.startMinute && minuteOfDay < shift.endMinute) {
                if (!isInBreakTime(minuteOfDay)) {
                    return true;
                }
            }
        }
        return false;
    }

    function addDowntimePeriod(period) {
        const newPeriod = {
            id: Utils.generateUUID(),
            date: period.date,
            startMinute: period.startMinute || 480,
            endMinute: period.endMinute || 1080,
            reason: period.reason || ''
        };
        state.calendar.downtimePeriods.push(newPeriod);
        saveCalendar();
        addAuditLog(AUDIT_ACTION_TYPES.CALENDAR_UPDATE, { 
            action: 'add_downtime', 
            period: newPeriod 
        });
        return newPeriod;
    }

    function removeDowntimePeriod(id) {
        const index = state.calendar.downtimePeriods.findIndex(p => p.id === id);
        if (index !== -1) {
            const removed = state.calendar.downtimePeriods.splice(index, 1)[0];
            saveCalendar();
            addAuditLog(AUDIT_ACTION_TYPES.CALENDAR_UPDATE, { 
                action: 'remove_downtime', 
                period: removed 
            });
            return true;
        }
        return false;
    }

    function addBreakPeriod(breakPeriod) {
        const newPeriod = {
            id: Utils.generateUUID(),
            name: breakPeriod.name || '休息',
            startMinute: breakPeriod.startMinute,
            endMinute: breakPeriod.endMinute,
            recurring: breakPeriod.recurring !== false
        };
        state.calendar.breakPeriods.push(newPeriod);
        saveCalendar();
        return newPeriod;
    }

    function removeBreakPeriod(id) {
        const index = state.calendar.breakPeriods.findIndex(p => p.id === id);
        if (index !== -1) {
            state.calendar.breakPeriods.splice(index, 1);
            saveCalendar();
            return true;
        }
        return false;
    }

    function getWorkStartTime() {
        const shifts = getShifts();
        if (shifts.length === 0) return state.calendar.workStartTime;
        return Math.min(...shifts.map(s => s.startMinute));
    }

    function getWorkEndTime() {
        const shifts = getShifts();
        if (shifts.length === 0) return state.calendar.workEndTime;
        return Math.max(...shifts.map(s => s.endMinute));
    }

    function getAvailableMinutesPerDay() {
        const shifts = getShifts();
        let total = 0;
        for (const shift of shifts) {
            let shiftDuration = shift.endMinute - shift.startMinute;
            for (const bp of state.calendar.breakPeriods) {
                const overlapStart = Math.max(bp.startMinute, shift.startMinute);
                const overlapEnd = Math.min(bp.endMinute, shift.endMinute);
                if (overlapEnd > overlapStart) {
                    shiftDuration -= (overlapEnd - overlapStart);
                }
            }
            total += shiftDuration;
        }
        return total || 600;
    }

    function isWorkDay(date) {
        const dayOfWeek = new Date(date).getDay();
        return state.calendar.workDays.includes(dayOfWeek);
    }

    function isDowntime(date, minuteOfDay = null) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        const checkTime = minuteOfDay !== null;
        
        for (const period of state.calendar.downtimePeriods) {
            if (dateStr === period.date) {
                if (!checkTime) return true;
                if (minuteOfDay >= period.startMinute && minuteOfDay <= period.endMinute) {
                    return true;
                }
            }
        }
        return false;
    }

    function isAvailableProductionTime(date, minuteOfDay) {
        if (!isWorkDay(date)) return false;
        if (isDowntime(date, minuteOfDay)) return false;
        if (isInBreakTime(minuteOfDay)) return false;
        if (!isInAnyShift(minuteOfDay)) return false;
        return true;
    }

    function getNextWorkDay(fromDate, daysToAdd = 1) {
        let current = new Date(fromDate);
        let added = 0;
        
        while (added < daysToAdd) {
            current.setDate(current.getDate() + 1);
            if (isWorkDay(current) && !isDowntime(current)) {
                added++;
            }
        }
        
        return current;
    }

    function getWorkDayOffset(fromDate, dayOffset) {
        let current = new Date(fromDate);
        let workDaysPassed = 0;
        
        while (workDaysPassed < dayOffset) {
            current.setDate(current.getDate() + 1);
            if (isWorkDay(current) && !isDowntime(current)) {
                workDaysPassed++;
            }
        }
        
        return current;
    }

    function findNextAvailableMinute(fromDate, fromMinute, direction = 1) {
        let currentDate = new Date(fromDate);
        let currentMinute = fromMinute;
        const WORK_START = getWorkStartTime();
        const WORK_END = getWorkEndTime();
        
        let attempts = 0;
        const maxAttempts = 14 * 1440;
        
        while (attempts < maxAttempts) {
            if (!isWorkDay(currentDate) || isDowntime(currentDate, currentMinute)) {
                if (direction > 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    currentMinute = WORK_START;
                } else {
                    currentDate.setDate(currentDate.getDate() - 1);
                    currentMinute = WORK_END;
                }
                attempts++;
                continue;
            }
            
            if (currentMinute < WORK_START) {
                currentMinute = WORK_START;
            }
            if (currentMinute >= WORK_END) {
                if (direction > 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    currentMinute = WORK_START;
                } else {
                    currentDate.setDate(currentDate.getDate() - 1);
                    currentMinute = WORK_END - 1;
                }
                attempts++;
                continue;
            }
            
            if (isInBreakTime(currentMinute)) {
                if (direction > 0) {
                    const nextBreak = state.calendar.breakPeriods.find(
                        bp => currentMinute >= bp.startMinute && currentMinute < bp.endMinute
                    );
                    if (nextBreak) {
                        currentMinute = nextBreak.endMinute;
                    } else {
                        currentMinute += 1;
                    }
                } else {
                    currentMinute -= 1;
                }
                attempts++;
                continue;
            }
            
            if (!isInAnyShift(currentMinute)) {
                const shifts = getShifts();
                if (direction > 0) {
                    let foundNext = false;
                    for (const shift of shifts) {
                        if (shift.startMinute > currentMinute) {
                            currentMinute = shift.startMinute;
                            foundNext = true;
                            break;
                        }
                    }
                    if (!foundNext) {
                        currentDate.setDate(currentDate.getDate() + 1);
                        currentMinute = WORK_START;
                    }
                } else {
                    let foundPrev = false;
                    for (let i = shifts.length - 1; i >= 0; i--) {
                        if (shifts[i].endMinute < currentMinute) {
                            currentMinute = shifts[i].endMinute - 1;
                            foundPrev = true;
                            break;
                        }
                    }
                    if (!foundPrev) {
                        currentDate.setDate(currentDate.getDate() - 1);
                        currentMinute = WORK_END - 1;
                    }
                }
                attempts++;
                continue;
            }
            
            return { date: currentDate, minute: currentMinute };
        }
        
        return null;
    }

    function getExecutionData(orderId) {
        return state.executionData[orderId] || {
            actualStartTime: null,
            actualEndTime: null,
            progress: 0,
            actualQuantity: 0,
            notes: ''
        };
    }

    function updateExecutionData(orderId, updates) {
        if (!state.executionData[orderId]) {
            state.executionData[orderId] = {
                actualStartTime: null,
                actualEndTime: null,
                progress: 0,
                actualQuantity: 0,
                notes: ''
            };
        }
        state.executionData[orderId] = {
            ...state.executionData[orderId],
            ...updates
        };
        saveExecutionData();
        return state.executionData[orderId];
    }

    function startWork(orderId) {
        const order = getWorkOrderById(orderId);
        if (!order) return null;
        
        const now = Date.now();
        updateExecutionData(orderId, {
            actualStartTime: now,
            progress: 5
        });
        return updateOrderStatus(orderId, ORDER_STATUS.IN_PROGRESS);
    }

    function completeWork(orderId, actualQuantity = null) {
        const order = getWorkOrderById(orderId);
        if (!order) return null;
        
        const now = Date.now();
        const updates = {
            actualEndTime: now,
            progress: 100
        };
        if (actualQuantity !== null) {
            updates.actualQuantity = actualQuantity;
        }
        updateExecutionData(orderId, updates);
        return updateOrderStatus(orderId, ORDER_STATUS.COMPLETED);
    }

    function cancelWork(orderId, reason = '') {
        const order = getWorkOrderById(orderId);
        if (!order) return null;
        
        const execution = getExecutionData(orderId);
        if (!execution.actualEndTime) {
            updateExecutionData(orderId, {
                actualEndTime: Date.now(),
                notes: reason
            });
        }
        return updateOrderStatus(orderId, ORDER_STATUS.CANCELLED);
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                state.schemes = data.schemes || [];
                state.currentSchemeId = data.currentSchemeId || null;
                
                if (state.currentSchemeId) {
                    const current = state.schemes.find(s => s.id === state.currentSchemeId);
                    if (current) {
                        state.workOrders = Utils.deepClone(current.workOrders);
                    }
                }
            }
        } catch (e) {
            console.error('加载数据失败:', e);
        }
    }

    function saveToStorage() {
        try {
            const current = state.schemes.find(s => s.id === state.currentSchemeId);
            if (current) {
                current.workOrders = Utils.deepClone(state.workOrders);
                current.updatedAt = Date.now();
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                schemes: state.schemes,
                currentSchemeId: state.currentSchemeId
            }));
        } catch (e) {
            console.error('保存数据失败:', e);
            Utils.showToast('保存失败', 'error');
        }
    }

    function migrateOrders() {
        let changed = false;
        state.workOrders.forEach(order => {
            if (!order.status) {
                if (!order.lineId) {
                    order.status = ORDER_STATUS.PENDING;
                } else {
                    order.status = ORDER_STATUS.SCHEDULED;
                }
                changed = true;
            }
        });
        if (changed) {
            saveToStorage();
        }
    }

    function createDemoData() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const demoOrders = [
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-A001',
                quantity: 500,
                stdMinutes: 120,
                dueDate: tomorrow.toISOString().split('T')[0],
                lineId: 'lineA',
                startMinute: 480,
                dayOffset: 0,
                status: ORDER_STATUS.IN_PROGRESS,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-B002',
                quantity: 300,
                stdMinutes: 90,
                dueDate: tomorrow.toISOString().split('T')[0],
                lineId: 'lineA',
                startMinute: 600,
                dayOffset: 0,
                status: ORDER_STATUS.SCHEDULED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-C003',
                quantity: 800,
                stdMinutes: 180,
                dueDate: dayAfter.toISOString().split('T')[0],
                lineId: 'lineB',
                startMinute: 480,
                dayOffset: 0,
                status: ORDER_STATUS.COMPLETED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-D004',
                quantity: 200,
                stdMinutes: 60,
                dueDate: yesterday.toISOString().split('T')[0],
                lineId: 'lineC',
                startMinute: 540,
                dayOffset: 0,
                status: ORDER_STATUS.CANCELLED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-E005',
                quantity: 450,
                stdMinutes: 150,
                dueDate: nextWeek.toISOString().split('T')[0],
                lineId: null,
                startMinute: null,
                status: ORDER_STATUS.PENDING,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-F006',
                quantity: 1000,
                stdMinutes: 240,
                dueDate: dayAfter.toISOString().split('T')[0],
                lineId: null,
                startMinute: null,
                status: ORDER_STATUS.PENDING,
                createdAt: Date.now()
            }
        ];

        state.workOrders = demoOrders;
        
        demoOrders.forEach(order => {
            if (order.status === ORDER_STATUS.COMPLETED) {
                state.executionData[order.id] = {
                    actualStartTime: Date.now() - 86400000,
                    actualEndTime: Date.now() - 82800000,
                    progress: 100,
                    actualQuantity: order.quantity,
                    notes: '正常完成'
                };
            } else if (order.status === ORDER_STATUS.IN_PROGRESS) {
                state.executionData[order.id] = {
                    actualStartTime: Date.now() - 3600000,
                    actualEndTime: null,
                    progress: 45,
                    actualQuantity: Math.floor(order.quantity * 0.45),
                    notes: ''
                };
            }
        });
        saveExecutionData();
        
        const defaultScheme = {
            id: Utils.generateUUID(),
            name: '默认方案',
            workOrders: Utils.deepClone(demoOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes = [defaultScheme];
        state.currentSchemeId = defaultScheme.id;
        saveToStorage();
        
        addAuditLog(AUDIT_ACTION_TYPES.SCHEME_SAVE, { 
            schemeName: defaultScheme.name,
            action: 'create_default'
        });
    }

    function getWorkOrders() {
        return state.workOrders;
    }

    function getWorkOrderById(id) {
        return state.workOrders.find(o => o.id === id);
    }

    function getOrdersByStatus(status) {
        return state.workOrders.filter(o => o.status === status);
    }

    function getUnscheduledOrders() {
        return state.workOrders.filter(o => o.status === ORDER_STATUS.PENDING);
    }

    function getScheduledOrders() {
        return state.workOrders.filter(o => 
            o.status === ORDER_STATUS.SCHEDULED || 
            o.status === ORDER_STATUS.IN_PROGRESS
        );
    }

    function getActiveOrders() {
        return state.workOrders.filter(o => 
            o.status !== ORDER_STATUS.COMPLETED && 
            o.status !== ORDER_STATUS.CANCELLED
        );
    }

    function getAllOrders() {
        return state.workOrders;
    }

    function getOrdersByLine(lineId, includeHistorical = false) {
        let orders = state.workOrders.filter(o => o.lineId === lineId);
        if (!includeHistorical) {
            orders = orders.filter(o => 
                o.status !== ORDER_STATUS.COMPLETED && 
                o.status !== ORDER_STATUS.CANCELLED
            );
        }
        return orders.sort((a, b) => {
            const dayA = a.dayOffset || 0;
            const dayB = b.dayOffset || 0;
            if (dayA !== dayB) return dayA - dayB;
            return (a.startMinute || 0) - (b.startMinute || 0);
        });
    }

    function addWorkOrder(order) {
        let status = order.status;
        if (!status) {
            status = order.lineId ? ORDER_STATUS.SCHEDULED : ORDER_STATUS.PENDING;
        }

        const newOrder = {
            id: Utils.generateUUID(),
            productModel: order.productModel,
            quantity: parseInt(order.quantity),
            stdMinutes: parseInt(order.stdMinutes),
            dueDate: order.dueDate,
            lineId: order.lineId || null,
            startMinute: order.startMinute || null,
            dayOffset: order.lineId ? (order.dayOffset || 0) : null,
            status: status,
            segments: order.segments || null,
            createdAt: Date.now()
        };
        
        state.workOrders.push(newOrder);
        saveToStorage();
        
        addAuditLog(AUDIT_ACTION_TYPES.ORDER_ADD, {
            orderId: newOrder.id,
            productModel: newOrder.productModel,
            quantity: newOrder.quantity,
            stdMinutes: newOrder.stdMinutes
        });
        
        return newOrder;
    }

    function updateWorkOrder(id, updates) {
        const index = state.workOrders.findIndex(o => o.id === id);
        if (index !== -1) {
            const oldOrder = Utils.deepClone(state.workOrders[index]);
            
            const auditDetails = {
                orderId: id,
                productModel: oldOrder.productModel,
                changes: {}
            };
            
            if (updates.lineId !== undefined || updates.startMinute !== undefined || updates.dayOffset !== undefined) {
                const oldPos = {
                    lineId: oldOrder.lineId,
                    startMinute: oldOrder.startMinute,
                    dayOffset: oldOrder.dayOffset
                };
                const newPos = {
                    lineId: updates.lineId !== undefined ? updates.lineId : oldOrder.lineId,
                    startMinute: updates.startMinute !== undefined ? updates.startMinute : oldOrder.startMinute,
                    dayOffset: updates.dayOffset !== undefined ? updates.dayOffset : oldOrder.dayOffset
                };
                
                if (JSON.stringify(oldPos) !== JSON.stringify(newPos)) {
                    auditDetails.changes.position = { from: oldPos, to: newPos };
                    auditDetails.actionType = AUDIT_ACTION_TYPES.ORDER_MOVE;
                }
            }
            
            for (const key in updates) {
                if (key !== 'lineId' && key !== 'startMinute' && key !== 'dayOffset' && 
                    key !== 'segments' && oldOrder[key] !== updates[key]) {
                    auditDetails.changes[key] = { 
                        from: oldOrder[key], 
                        to: updates[key] 
                    };
                }
            }
            
            if (updates.lineId !== undefined) {
                if (updates.lineId && !updates.status) {
                    updates.status = ORDER_STATUS.SCHEDULED;
                } else if (!updates.lineId && !updates.status) {
                    updates.status = ORDER_STATUS.PENDING;
                    updates.startMinute = null;
                    updates.dayOffset = null;
                }
            }
            
            if (updates.status && updates.status !== oldOrder.status) {
                auditDetails.changes.status = {
                    from: oldOrder.status,
                    to: updates.status
                };
                if (!auditDetails.actionType) {
                    auditDetails.actionType = AUDIT_ACTION_TYPES.ORDER_STATUS_CHANGE;
                }
            }
            
            state.workOrders[index] = { ...state.workOrders[index], ...updates };
            saveToStorage();
            
            if (Object.keys(auditDetails.changes).length > 0) {
                addAuditLog(auditDetails.actionType || AUDIT_ACTION_TYPES.ORDER_EDIT, auditDetails);
            }
            
            return state.workOrders[index];
        }
        return null;
    }

    function updateOrderStatus(id, newStatus) {
        const order = getWorkOrderById(id);
        if (!order) return null;

        const updates = { status: newStatus };
        
        if (newStatus === ORDER_STATUS.PENDING) {
            updates.lineId = null;
            updates.startMinute = null;
            updates.dayOffset = null;
            updates.segments = null;
        }
        
        return updateWorkOrder(id, updates);
    }

    function deleteWorkOrder(id) {
        const index = state.workOrders.findIndex(o => o.id === id);
        if (index !== -1) {
            const removed = state.workOrders.splice(index, 1)[0];
            saveToStorage();
            
            addAuditLog(AUDIT_ACTION_TYPES.ORDER_DELETE, {
                orderId: id,
                productModel: removed.productModel,
                quantity: removed.quantity
            });
            
            return true;
        }
        return false;
    }

    function getLines() {
        return LINES;
    }

    function getLineById(id) {
        return LINES.find(l => l.id === id);
    }

    function getLineLoad(lineId) {
        const line = getLineById(lineId);
        if (!line) return 0;
        
        const orders = getOrdersByLine(lineId);
        const totalMinutes = orders.reduce((sum, o) => sum + o.stdMinutes, 0);
        const availablePerDay = getAvailableMinutesPerDay();
        
        return Math.min(totalMinutes / availablePerDay * 100, 100);
    }

    function getOverdueCount() {
        return state.workOrders.filter(o => 
            Utils.isOverdue(o.dueDate) && 
            o.status !== ORDER_STATUS.COMPLETED &&
            o.status !== ORDER_STATUS.CANCELLED
        ).length;
    }

    function getStatusCount(status) {
        return state.workOrders.filter(o => o.status === status).length;
    }

    function getStatusStats() {
        return {
            pending: getStatusCount(ORDER_STATUS.PENDING),
            scheduled: getStatusCount(ORDER_STATUS.SCHEDULED),
            in_progress: getStatusCount(ORDER_STATUS.IN_PROGRESS),
            completed: getStatusCount(ORDER_STATUS.COMPLETED),
            cancelled: getStatusCount(ORDER_STATUS.CANCELLED)
        };
    }

    function getExecutionStats() {
        const orders = getWorkOrders();
        const inProgress = orders.filter(o => o.status === ORDER_STATUS.IN_PROGRESS);
        const completedToday = orders.filter(o => {
            if (o.status !== ORDER_STATUS.COMPLETED) return false;
            const exec = getExecutionData(o.id);
            if (!exec.actualEndTime) return false;
            const today = new Date();
            const endDate = new Date(exec.actualEndTime);
            return today.toDateString() === endDate.toDateString();
        });
        
        let totalProgress = 0;
        let progressCount = 0;
        inProgress.forEach(o => {
            const exec = getExecutionData(o.id);
            if (exec.progress > 0) {
                totalProgress += exec.progress;
                progressCount++;
            }
        });
        
        return {
            inProgressCount: inProgress.length,
            completedTodayCount: completedToday.length,
            avgProgress: progressCount > 0 ? Math.round(totalProgress / progressCount) : 0
        };
    }

    function getAvgLoad() {
        const loads = LINES.map(l => getLineLoad(l.id));
        return loads.reduce((sum, l) => sum + l, 0) / LINES.length;
    }

    function getSchemes() {
        return state.schemes;
    }

    function getCurrentSchemeId() {
        return state.currentSchemeId;
    }

    function getCurrentScheme() {
        return state.schemes.find(s => s.id === state.currentSchemeId);
    }

    function loadScheme(schemeId) {
        const scheme = state.schemes.find(s => s.id === schemeId);
        if (scheme) {
            const current = state.schemes.find(s => s.id === state.currentSchemeId);
            if (current) {
                current.workOrders = Utils.deepClone(state.workOrders);
                current.updatedAt = Date.now();
            }
            
            const oldSchemeId = state.currentSchemeId;
            const oldSchemeName = current?.name;
            
            state.currentSchemeId = schemeId;
            state.workOrders = Utils.deepClone(scheme.workOrders);
            saveToStorage();
            
            addAuditLog(AUDIT_ACTION_TYPES.SCHEME_SWITCH, {
                fromSchemeId: oldSchemeId,
                fromSchemeName: oldSchemeName,
                toSchemeId: schemeId,
                toSchemeName: scheme.name
            });
            
            return true;
        }
        return false;
    }

    function saveScheme(name, asNew = false) {
        if (asNew || !state.currentSchemeId) {
            const newScheme = {
                id: Utils.generateUUID(),
                name: name,
                workOrders: Utils.deepClone(state.workOrders),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            state.schemes.push(newScheme);
            state.currentSchemeId = newScheme.id;
            saveToStorage();
            
            addAuditLog(AUDIT_ACTION_TYPES.SCHEME_SAVE, {
                schemeName: name,
                schemeId: newScheme.id,
                action: 'create_new',
                orderCount: newScheme.workOrders.length
            });
            
            return newScheme;
        }
        
        const scheme = state.schemes.find(s => s.id === state.currentSchemeId);
        if (scheme) {
            scheme.name = name;
            scheme.workOrders = Utils.deepClone(state.workOrders);
            scheme.updatedAt = Date.now();
            saveToStorage();
            
            addAuditLog(AUDIT_ACTION_TYPES.SCHEME_SAVE, {
                schemeName: name,
                schemeId: scheme.id,
                action: 'update',
                orderCount: scheme.workOrders.length
            });
            
            return scheme;
        }
        
        const newScheme = {
            id: Utils.generateUUID(),
            name: name,
            workOrders: Utils.deepClone(state.workOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes.push(newScheme);
        state.currentSchemeId = newScheme.id;
        saveToStorage();
        return newScheme;
    }

    function copyScheme(sourceSchemeId, newName) {
        const sourceScheme = state.schemes.find(s => s.id === sourceSchemeId);
        if (!sourceScheme) return null;
        
        const newScheme = {
            id: Utils.generateUUID(),
            name: newName,
            workOrders: Utils.deepClone(sourceScheme.workOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes.push(newScheme);
        saveToStorage();
        
        addAuditLog(AUDIT_ACTION_TYPES.SCHEME_COPY, {
            sourceSchemeId: sourceSchemeId,
            sourceSchemeName: sourceScheme.name,
            newSchemeId: newScheme.id,
            newSchemeName: newName
        });
        
        return newScheme;
    }

    function deleteScheme(schemeId) {
        const index = state.schemes.findIndex(s => s.id === schemeId);
        if (index !== -1) {
            const removed = state.schemes.splice(index, 1)[0];
            if (state.currentSchemeId === schemeId) {
                state.currentSchemeId = state.schemes.length > 0 ? state.schemes[0].id : null;
                state.workOrders = state.currentSchemeId 
                    ? Utils.deepClone(state.schemes[0].workOrders) 
                    : [];
            }
            saveToStorage();
            
            addAuditLog(AUDIT_ACTION_TYPES.SCHEME_DELETE, {
                schemeId: schemeId,
                schemeName: removed.name,
                orderCount: removed.workOrders.length
            });
            
            return true;
        }
        return false;
    }

    function compareSchemes(schemeId1, schemeId2) {
        const scheme1 = state.schemes.find(s => s.id === schemeId1);
        const scheme2 = state.schemes.find(s => s.id === schemeId2);
        
        if (!scheme1 || !scheme2) return null;

        const result = {
            scheme1: { id: scheme1.id, name: scheme1.name },
            scheme2: { id: scheme2.id, name: scheme2.name },
            totalOrders: {
                scheme1: scheme1.workOrders.length,
                scheme2: scheme2.workOrders.length
            },
            lineComparison: {},
            lineOrders: {},
            movedOrders: [],
            addedOrders: [],
            removedOrders: [],
            statusChanges: [],
            changedOrderIds: new Set()
        };

        LINES.forEach(line => {
            const lineOrders1 = scheme1.workOrders.filter(o => o.lineId === line.id);
            const lineOrders2 = scheme2.workOrders.filter(o => o.lineId === line.id);
            
            result.lineComparison[line.id] = {
                lineName: line.name,
                scheme1: {
                    count: lineOrders1.length,
                    load: calculateLoad(lineOrders1, line),
                    orders: lineOrders1
                },
                scheme2: {
                    count: lineOrders2.length,
                    load: calculateLoad(lineOrders2, line),
                    orders: lineOrders2
                }
            };
            
            result.lineOrders[line.id] = {
                scheme1: lineOrders1.map(o => enrichOrderForCompare(o, scheme1.workOrders)),
                scheme2: lineOrders2.map(o => enrichOrderForCompare(o, scheme2.workOrders))
            };
        });

        const pending1 = scheme1.workOrders.filter(o => !o.lineId);
        const pending2 = scheme2.workOrders.filter(o => !o.lineId);
        result.lineOrders['pending'] = {
            scheme1: pending1.map(o => enrichOrderForCompare(o, scheme1.workOrders)),
            scheme2: pending2.map(o => enrichOrderForCompare(o, scheme2.workOrders))
        };

        const orderMap1 = {};
        scheme1.workOrders.forEach(o => { orderMap1[o.id] = o; });
        
        const orderMap2 = {};
        scheme2.workOrders.forEach(o => { orderMap2[o.id] = o; });

        const allIds = new Set([...Object.keys(orderMap1), ...Object.keys(orderMap2)]);
        
        allIds.forEach(id => {
            const o1 = orderMap1[id];
            const o2 = orderMap2[id];
            
            if (o1 && o2) {
                const moved = (o1.lineId !== o2.lineId) || 
                              (o1.startMinute !== o2.startMinute) ||
                              (o1.dayOffset !== o2.dayOffset);
                
                if (moved) {
                    result.movedOrders.push({
                        id: id,
                        model: o1.productModel,
                        scheme1: { 
                            lineId: o1.lineId, 
                            startMinute: o1.startMinute, 
                            dayOffset: o1.dayOffset,
                            status: o1.status,
                            segments: o1.segments
                        },
                        scheme2: { 
                            lineId: o2.lineId, 
                            startMinute: o2.startMinute, 
                            dayOffset: o2.dayOffset,
                            status: o2.status,
                            segments: o2.segments
                        }
                    });
                    result.changedOrderIds.add(id);
                }

                if (o1.status !== o2.status) {
                    result.statusChanges.push({
                        id: id,
                        model: o1.productModel,
                        scheme1: o1.status,
                        scheme2: o2.status
                    });
                    result.changedOrderIds.add(id);
                }
            } else if (!o1 && o2) {
                result.addedOrders.push(o2);
                result.changedOrderIds.add(o2.id);
            } else if (o1 && !o2) {
                result.removedOrders.push(o1);
                result.changedOrderIds.add(o1.id);
            }
        });

        const stats1 = calculateStats(scheme1.workOrders);
        const stats2 = calculateStats(scheme2.workOrders);
        
        result.statsComparison = {
            scheme1: stats1,
            scheme2: stats2,
            overdueDiff: stats2.overdue - stats1.overdue,
            avgLoadDiff: stats2.avgLoad - stats1.avgLoad
        };

        return result;
    }

    function enrichOrderForCompare(order, allOrders) {
        return {
            ...order,
            statusLabel: STATUS_LABELS[order.status] || order.status,
            statusColor: STATUS_COLORS[order.status] || '#9aa4bd',
            isOverdue: Utils.isOverdue(order.dueDate) && 
                order.status !== ORDER_STATUS.COMPLETED &&
                order.status !== ORDER_STATUS.CANCELLED,
            timeLabel: order.lineId ? formatOrderTime(order) : '待排程',
            lineName: order.lineId ? (getLineById(order.lineId)?.name || order.lineId) : null,
            executionData: state.executionData[order.id] || null
        };
    }

    function formatOrderTime(order) {
        if (!order.startMinute) return '--';
        const dayLabel = order.dayOffset ? `Day${order.dayOffset + 1}` : '今日';
        const start = Utils.formatMinutes(order.startMinute);
        const end = Utils.formatMinutes(order.startMinute + order.stdMinutes);
        return `${dayLabel} ${start}-${end}`;
    }

    function calculateLoad(orders, line) {
        const totalMinutes = orders.reduce((sum, o) => sum + o.stdMinutes, 0);
        const availablePerDay = getAvailableMinutesPerDay();
        return Math.min(totalMinutes / availablePerDay * 100, 100);
    }

    function calculateStats(orders) {
        const total = orders.length;
        const overdue = orders.filter(o => 
            Utils.isOverdue(o.dueDate) && 
            o.status !== ORDER_STATUS.COMPLETED &&
            o.status !== ORDER_STATUS.CANCELLED
        ).length;
        
        let totalLoad = 0;
        LINES.forEach(line => {
            const lineOrders = orders.filter(o => o.lineId === line.id);
            totalLoad += calculateLoad(lineOrders, line);
        });
        
        return {
            total,
            overdue,
            avgLoad: totalLoad / LINES.length,
            completed: orders.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
            inProgress: orders.filter(o => o.status === ORDER_STATUS.IN_PROGRESS).length
        };
    }

    function hasConflict(orderId, lineId, startMinute, duration, dayOffset = 0) {
        const WORK_START = getWorkStartTime();
        const WORK_END = getWorkEndTime();
        const WORK_PER_DAY = getAvailableMinutesPerDay();
        
        if (!isInAnyShift(startMinute) || isInBreakTime(startMinute)) {
            return true;
        }
        
        const newStartAbsolute = dayOffset * WORK_PER_DAY + (startMinute - WORK_START);
        const newEndAbsolute = newStartAbsolute + duration;
        
        const lineOrders = getOrdersByLine(lineId).filter(o => o.id !== orderId);
        
        for (const order of lineOrders) {
            const orderDay = order.dayOffset || 0;
            const orderStartAbsolute = orderDay * WORK_PER_DAY + (order.startMinute - WORK_START);
            const orderEndAbsolute = orderStartAbsolute + order.stdMinutes;
            
            if (newStartAbsolute < orderEndAbsolute && newEndAbsolute > orderStartAbsolute) {
                return true;
            }
        }
        return false;
    }

    function splitOrderForMultiDay(order, lineId, startMinute, dayOffset = 0) {
        const WORK_START = getWorkStartTime();
        const WORK_END = getWorkEndTime();
        
        const segments = [];
        let remainingMinutes = order.stdMinutes;
        let currentDay = dayOffset;
        let currentMinute = startMinute;
        let safetyCounter = 0;
        const MAX_DAYS = 30;
        
        while (remainingMinutes > 0 && safetyCounter < MAX_DAYS) {
            safetyCounter++;
            const workDate = getWorkDayOffset(new Date(), currentDay);
            if (!isWorkDay(workDate) || isDowntime(workDate)) {
                currentDay++;
                continue;
            }
            
            const availableToday = calculateAvailableMinutesInDay(workDate, currentMinute);
            
            if (availableToday.available <= 0) {
                currentDay++;
                currentMinute = WORK_START;
                continue;
            }
            
            const workToday = Math.min(remainingMinutes, availableToday.duration);
            
            segments.push({
                dayOffset: currentDay,
                startMinute: availableToday.startMinute,
                duration: workToday,
                endMinute: availableToday.startMinute + workToday
            });
            
            remainingMinutes -= workToday;
            
            if (remainingMinutes > 0) {
                currentDay++;
                currentMinute = WORK_START;
            }
        }
        
        return segments;
    }

    function calculateAvailableMinutesInDay(date, fromMinute) {
        const WORK_START = getWorkStartTime();
        let currentMinute = Math.max(fromMinute, WORK_START);
        let totalAvailable = 0;
        let effectiveStart = null;
        
        const shifts = getShifts();
        for (const shift of shifts) {
            let shiftStart = Math.max(shift.startMinute, currentMinute);
            let shiftEnd = shift.endMinute;
            
            for (const bp of state.calendar.breakPeriods) {
                if (bp.startMinute >= shiftStart && bp.startMinute < shiftEnd) {
                    if (effectiveStart === null) {
                        effectiveStart = shiftStart;
                    }
                    totalAvailable += (bp.startMinute - shiftStart);
                    shiftStart = bp.endMinute;
                } else if (bp.startMinute < shiftStart && bp.endMinute > shiftStart && bp.endMinute <= shiftEnd) {
                    shiftStart = bp.endMinute;
                }
            }
            
            if (shiftStart < shiftEnd) {
                if (effectiveStart === null) {
                    effectiveStart = shiftStart;
                }
                totalAvailable += (shiftEnd - shiftStart);
            }
        }
        
        return {
            startMinute: effectiveStart || currentMinute,
            duration: totalAvailable,
            available: totalAvailable > 0
        };
    }

    const exports = {
        init,
        getWorkOrders,
        getWorkOrderById,
        getUnscheduledOrders,
        getScheduledOrders,
        getActiveOrders,
        getAllOrders,
        getOrdersByLine,
        getOrdersByStatus,
        getStatusCount,
        getStatusStats,
        getExecutionStats,
        addWorkOrder,
        updateWorkOrder,
        updateOrderStatus,
        deleteWorkOrder,
        getLines,
        getLineById,
        getLineLoad,
        getOverdueCount,
        getAvgLoad,
        getSchemes,
        getCurrentSchemeId,
        getCurrentScheme,
        loadScheme,
        saveScheme,
        copyScheme,
        deleteScheme,
        hasConflict,
        saveToStorage,
        compareSchemes,
        ORDER_STATUS,
        STATUS_LABELS,
        STATUS_COLORS,
        AUDIT_ACTION_TYPES,
        AUDIT_ACTION_LABELS,
        SHIFT_TYPES,
        DEFAULT_SHIFTS,
        getCalendar,
        updateCalendar,
        getShifts,
        getActiveShiftAt,
        isInBreakTime,
        isInAnyShift,
        getWorkStartTime,
        getWorkEndTime,
        getAvailableMinutesPerDay,
        addDowntimePeriod,
        removeDowntimePeriod,
        addBreakPeriod,
        removeBreakPeriod,
        isWorkDay,
        isDowntime,
        isAvailableProductionTime,
        getNextWorkDay,
        getWorkDayOffset,
        findNextAvailableMinute,
        splitOrderForMultiDay,
        getAuditLogs,
        addAuditLog,
        getExecutionData,
        updateExecutionData,
        startWork,
        completeWork,
        cancelWork
    };
    if (typeof window !== 'undefined') {
        window.Store = exports;
    }
    return exports;
})();
