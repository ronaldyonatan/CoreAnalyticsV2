package com.coreanalytics.jdbc;

import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverPropertyInfo;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Experimental, not wired into the worker. Opens a SQL Server connection and
 * enters a separately provisioned, audited principal BEFORE returning it.
 * Database-level checks are defense in depth, not proof of object-level safety.
 * No credentials, URLs, user SQL or driver exceptions may be logged here.
 */
public final class GuardedSqlServerDriver implements Driver {
    private static final String LOGIN_PROPERTY = "coreanalyticsExecutionLogin";
    private static final Pattern LOGIN = Pattern.compile("[A-Za-z_][A-Za-z0-9_.@\\\\-]{0,127}");
    private static final String IDENTITY_CHECK =
        "SELECT SUSER_SNAME(), IS_SRVROLEMEMBER('sysadmin'), IS_ROLEMEMBER('db_owner'), " +
        "HAS_PERMS_BY_NAME(NULL,'DATABASE','CONTROL'), HAS_PERMS_BY_NAME(NULL,'DATABASE','ALTER'), " +
        "HAS_PERMS_BY_NAME(NULL,'DATABASE','INSERT'), HAS_PERMS_BY_NAME(NULL,'DATABASE','UPDATE'), " +
        "HAS_PERMS_BY_NAME(NULL,'DATABASE','DELETE'), HAS_PERMS_BY_NAME(NULL,'DATABASE','EXECUTE')";

    @Override
    public Connection connect(String url, Properties properties) throws SQLException {
        if (!acceptsURL(url)) return null;
        Connection connection = null;
        try {
            if (properties == null) throw new IllegalArgumentException();
            Properties forwarded = new Properties();
            String login = null;
            for (String key : properties.stringPropertyNames()) {
                String value = properties.getProperty(key);
                if (LOGIN_PROPERTY.equalsIgnoreCase(key)) {
                    if (login != null) throw new IllegalArgumentException();
                    login = value;
                } else {
                    forwarded.setProperty(key, value);
                }
            }
            if (login == null || !LOGIN.matcher(login).matches()
                || login.equalsIgnoreCase("sa") || login.equalsIgnoreCase("dbo")) {
                throw new IllegalArgumentException();
            }
            Driver delegate = (Driver) Class.forName("com.microsoft.sqlserver.jdbc.SQLServerDriver")
                .getDeclaredConstructor().newInstance();
            connection = delegate.connect(url, forwarded);
            if (connection == null) throw new SQLException();
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(30);
                // Strict login validation above excludes quotes and delimiters.
                statement.execute("EXECUTE AS LOGIN = N'" + login + "' WITH NO REVERT;");
                try (ResultSet row = statement.executeQuery(IDENTITY_CHECK)) {
                    if (!row.next() || !login.equalsIgnoreCase(row.getString(1))) throw new SQLException();
                    for (int column = 2; column <= 9; column++) {
                        int permission = row.getInt(column);
                        if (row.wasNull() || permission != 0) throw new SQLException();
                    }
                    if (row.next()) throw new SQLException();
                }
            }
            return connection;
        } catch (Exception e) {
            if (connection != null) try { connection.close(); } catch (SQLException ignored) { }
            // Avoid attaching the original exception: JDBC messages may contain secrets.
            throw new SQLException("GUARDED_SQL_CONNECTION_UNAVAILABLE", "08001");
        }
    }

    @Override public boolean acceptsURL(String url) { return url != null && url.startsWith("jdbc:sqlserver:"); }
    @Override public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) { return new DriverPropertyInfo[0]; }
    @Override public int getMajorVersion() { return 1; }
    @Override public int getMinorVersion() { return 0; }
    @Override public boolean jdbcCompliant() { return false; }
    @Override public Logger getParentLogger() { return Logger.getLogger("com.coreanalytics.jdbc"); }
}
