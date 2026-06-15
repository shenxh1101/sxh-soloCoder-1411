const Scheduler = (function() {
    let WORK_START_MINUTE = 480;
    let WORK_END_MINUTE = 1080;
    let WORK_MINUTES_PER_DAY = WORK_END_MINUTE - WORK_START_MINUTE;
    const MAX_DAYS = 14;
    const SNAP_MINUTES = 15;

    function updateCalendarSettings() {
        const calendar = Store.getCalendar();
        if (calendar) {
            WORK_START_MINUTE = calendar.workStartTime;
            WORK_END_MINUTE = calendar.workEndTime;
            WORK_MINUTES_PER_DAY = WORK_END_MINUTE - WORK_START_MINUTE;
        }
    }

    function autoSchedule(algorithm = 'edd') {
        updateCalendarSettings();
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
                const segments = Store.splitOrderForMultiDay(
                    order, 
                    result.lineId, 
                    result.startMinute, 
                    result.dayOffset
                );
                
                Store.updateWorkOrder(order.id, {
                    lineId: result.lineId,
                    startMinute: segments[0].startMinute,
                    dayOffset: segments[0].dayOffset,
                    segments: segments.length > 1 ? segments : null
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
        updateCalendarSettings();
        const lines = Store.getLines();
        let bestSlot = null;
        let earliestEnd = Infinity;
        
        lines.forEach(line => {
            const slot = findEarliestSlot(order, line.id);
            if (slot !== null) {
                const segments = Store.splitOrderForMultiDay(order, line.id, slot.startMinute, slot.dayOffset);
                const lastSegment = segments[segments.length - 1];
                const endAbsolute = lastSegment.dayOffset * WORK_MINUTES_PER_DAY + 
                                   (lastSegment.endMinute - WORK_START_MINUTE);
                
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
        updateCalendarSettings();
        const line = Store.getLineById(lineId);
        if (!line) return null;
        
        const lineOrders = Store.getOrdersByLine(lineId).filter(o => o.id !== order.id);
        
        if (lineOrders.length === 0) {
            const firstWorkDay = findNextWorkDay(0);
            return { startMinute: line.workStartTime, dayOffset: firstWorkDay };
        }
        
        const occupiedSlots = [];
        lineOrders.forEach(existing => {
            const segments = existing.segments || [{
                dayOffset: existing.dayOffset || 0,
                startMinute: existing.startMinute,
                duration: existing.stdMinutes,
                endMinute: existing.startMinute + existing.stdMinutes
            }];
            
            segments.forEach(seg => {
                const startAbsolute = seg.dayOffset * WORK_MINUTES_PER_DAY + 
                                    (seg.startMinute - WORK_START_MINUTE);
                const endAbsolute = startAbsolute + seg.duration;
                occupiedSlots.push({ start: startAbsolute, end: endAbsolute });
            });
        });
        
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        const orderDuration = Math.min(order.stdMinutes, WORK_MINUTES_PER_DAY);
        
        for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
            if (!isValidWorkDay(dayOffset)) continue;
            
            const dayStartAbsolute = dayOffset * WORK_MINUTES_PER_DAY;
            const dayEndAbsolute = dayStartAbsolute + WORK_MINUTES_PER_DAY;
            
            let candidateStart = dayStartAbsolute;
            
            const daySlots = occupiedSlots.filter(s => 
                s.end > dayStartAbsolute && s.start < dayEndAbsolute
            );
            
            for (const slot of daySlots) {
                if (candidateStart + orderDuration <= slot.start) {
                    const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                    return { 
                        startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), 
                        dayOffset: dayOffset 
                    };
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + orderDuration <= dayEndAbsolute) {
                const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                return { 
                    startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), 
                    dayOffset: dayOffset 
                };
            }
        }
        
        return null;
    }

    function findNextWorkDay(fromDayOffset) {
        for (let i = fromDayOffset; i < MAX_DAYS; i++) {
            if (isValidWorkDay(i)) {
                return i;
            }
        }
        return fromDayOffset;
    }

    function isValidWorkDay(dayOffset) {
        const date = Store.getWorkDayOffset(new Date(), dayOffset);
        return Store.isWorkDay(date) && !Store.isDowntime(date);
    }

    function findNextAvailableSlot(lineId, duration, excludeOrderId = null) {
        updateCalendarSettings();
        let lineOrders = Store.getOrdersByLine(lineId);
        if (excludeOrderId) {
            lineOrders = lineOrders.filter(o => o.id !== excludeOrderId);
        }
        
        const occupiedSlots = [];
        lineOrders.forEach(existing => {
            const segments = existing.segments || [{
                dayOffset: existing.dayOffset || 0,
                startMinute: existing.startMinute,
                duration: existing.stdMinutes,
                endMinute: existing.startMinute + existing.stdMinutes
            }];
            
            segments.forEach(seg => {
                const startAbsolute = seg.dayOffset * WORK_MINUTES_PER_DAY + 
                                    (seg.startMinute - WORK_START_MINUTE);
                const endAbsolute = startAbsolute + seg.duration;
                occupiedSlots.push({ start: startAbsolute, end: endAbsolute });
            });
        });
        
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        const checkDuration = Math.min(duration, WORK_MINUTES_PER_DAY);
        
        for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
            if (!isValidWorkDay(dayOffset)) continue;
            
            const dayStartAbsolute = dayOffset * WORK_MINUTES_PER_DAY;
            const dayEndAbsolute = dayStartAbsolute + WORK_MINUTES_PER_DAY;
            
            let candidateStart = dayStartAbsolute;
            
            const daySlots = occupiedSlots.filter(s => 
                s.end > dayStartAbsolute && s.start < dayEndAbsolute
            );
            
            for (const slot of daySlots) {
                if (candidateStart + checkDuration <= slot.start) {
                    const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                    return { 
                        startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), 
                        dayOffset: dayOffset 
                    };
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + checkDuration <= dayEndAbsolute) {
                const candidateMinute = WORK_START_MINUTE + (candidateStart % WORK_MINUTES_PER_DAY);
                return { 
                    startMinute: Utils.roundToNearest(candidateMinute, SNAP_MINUTES), 
                    dayOffset: dayOffset 
                };
            }
        }
        
        return null;
    }

    function balanceLoad() {
        updateCalendarSettings();
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
                    const segments = Store.splitOrderForMultiDay(order, minLoadLine, slot.startMinute, slot.dayOffset);
                    
                    Store.updateWorkOrder(order.id, {
                        lineId: minLoadLine,
                        startMinute: segments[0].startMinute,
                        dayOffset: segments[0].dayOffset,
                        segments: segments.length > 1 ? segments : null
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
            if (order.status !== Store.ORDER_STATUS.COMPLETED && 
                order.status !== Store.ORDER_STATUS.CANCELLED) {
                Store.updateWorkOrder(order.id, {
                    lineId: null,
                    startMinute: null,
                    dayOffset: null,
                    segments: null,
                    status: Store.ORDER_STATUS.PENDING
                });
            }
        });
        
        const count = autoSchedule(algorithm);
        
        return count;
    }

    return {
        autoSchedule,
        rescheduleAll,
        balanceLoad,
        findNextAvailableSlot,
        findEarliestSlot,
        updateCalendarSettings
    };
})();
