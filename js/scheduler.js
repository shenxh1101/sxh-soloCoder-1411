const Scheduler = (function() {
    const WORK_START_MINUTE = 480;
    const WORK_END_MINUTE = 1080;
    const WORK_MINUTES_PER_DAY = WORK_END_MINUTE - WORK_START_MINUTE;
    const MAX_DAYS = 3;
    const SNAP_MINUTES = 15;

    function autoSchedule(algorithm = 'edd') {
        const unscheduled = Store.getUnscheduledOrders();
        
        if (unscheduled.length === 0) {
            Utils.showToast('没有待排程的工单', 'warning');
            return 0;
        }
        
        const sortedOrders = sortOrders(unscheduled, algorithm);
        let scheduledCount = 0;
        
        sortedOrders.forEach(order => {
            const result = findBestSlot(order);
            if (result) {
                Store.updateWorkOrder(order.id, {
                    lineId: result.lineId,
                    startMinute: result.startMinute,
                    dayOffset: result.dayOffset
                });
                scheduledCount++;
            }
        });
        
        if (scheduledCount === 0) {
            Utils.showToast('没有足够的时间排程所有工单', 'warning');
        }
        
        return scheduledCount;
    }

    function sortOrders(orders, algorithm) {
        const sorted = [...orders];
        
        switch (algorithm) {
            case 'edd':
                sorted.sort((a, b) => {
                    const dateA = new Date(a.dueDate);
                    const dateB = new Date(b.dueDate);
                    return dateA - dateB;
                });
                break;
                
            case 'spt':
                sorted.sort((a, b) => a.stdMinutes - b.stdMinutes);
                break;
                
            default:
                break;
        }
        
        return sorted;
    }

    function findBestSlot(order) {
        const lines = Store.getLines();
        let bestSlot = null;
        let earliestEnd = Infinity;
        
        lines.forEach(line => {
            const slot = findEarliestSlot(order, line.id);
            if (slot !== null) {
                const endAbsolute = slot.dayOffset * WORK_MINUTES_PER_DAY + (slot.startMinute - WORK_START_MINUTE) + order.stdMinutes;
                if (endAbsolute < earliestEnd) {
                    earliestEnd = endAbsolute;
                    bestSlot = {
                        lineId: line.id,
                        startMinute: slot.startMinute,
                        dayOffset: slot.dayOffset
                    };
                }
            }
        });
        
        return bestSlot;
    }

    function findEarliestSlot(order, lineId) {
        const line = Store.getLineById(lineId);
        if (!line) return null;
        
        const lineOrders = Store.getOrdersByLine(lineId).filter(o => o.id !== order.id);
        
        if (lineOrders.length === 0) {
            return { startMinute: line.workStartTime, dayOffset: 0 };
        }
        
        const occupiedSlots = [];
        lineOrders.forEach(existing => {
            const dayOffset = existing.dayOffset || 0;
            const startAbsolute = dayOffset * WORK_MINUTES_PER_DAY + (existing.startMinute - WORK_START_MINUTE);
            const endAbsolute = startAbsolute + existing.stdMinutes;
            occupiedSlots.push({ start: startAbsolute, end: endAbsolute });
        });
        
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        const orderDuration = order.stdMinutes;
        
        for (let day = 0; day < MAX_DAYS; day++) {
            const dayStartAbsolute = day * WORK_MINUTES_PER_DAY;
            const dayEndAbsolute = dayStartAbsolute + WORK_MINUTES_PER_DAY;
            
            let candidateStart = dayStartAbsolute;
            
            const daySlots = occupiedSlots.filter(s => s.end > dayStartAbsolute && s.start < dayEndAbsolute);
            
            for (const slot of daySlots) {
                if (candidateStart + orderDuration <= slot.start) {
                    const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                    return { startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), dayOffset: day };
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + orderDuration <= dayEndAbsolute) {
                const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                return { startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), dayOffset: day };
            }
        }
        
        return null;
    }

    function balanceLoad() {
        const lines = Store.getLines();
        const allScheduled = Store.getScheduledOrders();
        
        if (allScheduled.length === 0) return;
        
        const lineLoads = {};
        lines.forEach(line => {
            lineLoads[line.id] = Store.getLineLoad(line.id);
        });
        
        allScheduled.sort((a, b) => b.stdMinutes - a.stdMinutes);
        
        allScheduled.forEach(order => {
            let minLoadLine = null;
            let minLoad = Infinity;
            
            lines.forEach(line => {
                const slot = findEarliestSlot(order, line.id);
                if (slot !== null) {
                    const newLoad = lineLoads[line.id] + (order.stdMinutes / WORK_MINUTES_PER_DAY * 100);
                    if (newLoad < minLoad) {
                        minLoad = newLoad;
                        minLoadLine = line.id;
                    }
                }
            });
            
            if (minLoadLine && minLoadLine !== order.lineId) {
                const slot = findEarliestSlot(order, minLoadLine);
                if (slot !== null) {
                    const oldLine = order.lineId;
                    Store.updateWorkOrder(order.id, {
                        lineId: minLoadLine,
                        startMinute: slot.startMinute,
                        dayOffset: slot.dayOffset
                    });
                    
                    lineLoads[oldLine] -= (order.stdMinutes / WORK_MINUTES_PER_DAY * 100);
                    lineLoads[minLoadLine] += (order.stdMinutes / WORK_MINUTES_PER_DAY * 100);
                }
            }
        });
    }

    function rescheduleAll(algorithm = 'edd') {
        const allOrders = Store.getWorkOrders();
        
        allOrders.forEach(order => {
            Store.updateWorkOrder(order.id, {
                lineId: null,
                startMinute: null,
                dayOffset: null
            });
        });
        
        const count = autoSchedule(algorithm);
        
        return count;
    }

    return {
        autoSchedule,
        rescheduleAll,
        balanceLoad
    };
})();
