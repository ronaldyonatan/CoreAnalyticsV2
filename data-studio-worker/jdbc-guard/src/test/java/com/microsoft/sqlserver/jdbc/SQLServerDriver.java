package com.microsoft.sqlserver.jdbc;

import java.lang.reflect.Proxy;
import java.sql.*;
import java.util.*;
import java.util.logging.Logger;

/** Fake JDBC delegate used only by the standalone guard tests. */
public final class SQLServerDriver implements Driver {
    public static final List<String> events = new ArrayList<>();
    public static Properties received;
    public static boolean unsafe, failImpersonation, nullPermission;
    public static void reset() { events.clear(); received = null; unsafe = false; failImpersonation = false; nullPermission = false; }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, java.lang.reflect.InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler);
    }
    private static Object fallback(Class<?> type) {
        if (!type.isPrimitive()) return null;
        if (type == boolean.class) return false;
        if (type == int.class) return 0;
        if (type == long.class) return 0L;
        return null;
    }
    @Override public Connection connect(String url, Properties info) {
        events.add("connect"); received = info;
        final boolean[] switched = {false};
        return proxy(Connection.class, (object, method, args) -> {
            if (method.getName().equals("close")) { events.add("connection-close"); return null; }
            if (method.getName().equals("prepareStatement")) {
                events.add("schema-prepare");
                if (!switched[0])
                    throw new SQLException("query prepared before guard");
                return proxy(PreparedStatement.class, (stmt, sm, sa) -> {
                    if (sm.getName().equals("executeQuery")) {
                        events.add("schema-query");
                        final int[] rowIndex = {0};
                        return proxy(ResultSet.class, (rs, rm, ra) -> {
                            if (rm.getName().equals("next")) return rowIndex[0]++ == 0;
                            if (rm.getName().equals("getInt")) return 42;
                            if (rm.getName().equals("wasNull")) return false;
                            if (rm.getName().equals("getMetaData")) {
                                return proxy(ResultSetMetaData.class, (md, mm, ma) -> {
                                    switch (mm.getName()) {
                                        case "getColumnCount": return 1;
                                        case "getColumnLabel": case "getColumnName": return "value";
                                        case "getColumnType": return Types.INTEGER;
                                        case "getColumnTypeName": return "int";
                                        case "getPrecision": return 10;
                                        case "isNullable": return ResultSetMetaData.columnNullable;
                                        case "isSigned": return true;
                                        default: return fallback(mm.getReturnType());
                                    }
                                });
                            }
                            return fallback(rm.getReturnType());
                        });
                    }
                    return fallback(sm.getReturnType());
                });
            }
            if (method.getName().equals("createStatement")) {
                events.add("statement-create");
                return proxy(Statement.class, (stmt, sm, sa) -> {
                    switch (sm.getName()) {
                        case "execute":
                            events.add("execute:" + sa[0]);
                            if (failImpersonation) throw new SQLException("secret-host-password");
                            if (String.valueOf(sa[0]).contains("WITH NO REVERT")) switched[0] = true;
                            return false;
                        case "executeQuery":
                            events.add("identity-check");
                            final int[] index = {0};
                            return proxy(ResultSet.class, (rs, rm, ra) -> {
                                switch (rm.getName()) {
                                    case "next": return index[0]++ == 0;
                                    case "getString": return "coreanalytics_reader";
                                    case "getInt": return unsafe && ((Integer) ra[0]) == 2 ? 1 : 0;
                                    case "wasNull": return nullPermission;
                                    case "close": events.add("result-close"); return null;
                                    default: return fallback(rm.getReturnType());
                                }
                            });
                        case "close": events.add("statement-close"); return null;
                        default: return fallback(sm.getReturnType());
                    }
                });
            }
            return fallback(method.getReturnType());
        });
    }
    @Override public boolean acceptsURL(String url) { return true; }
    @Override public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) { return new DriverPropertyInfo[0]; }
    @Override public int getMajorVersion() { return 1; }
    @Override public int getMinorVersion() { return 0; }
    @Override public boolean jdbcCompliant() { return false; }
    @Override public Logger getParentLogger() { return Logger.getGlobal(); }
}
