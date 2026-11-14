package com.coreanalytics.jdbc;

import com.microsoft.sqlserver.jdbc.SQLServerDriver;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Enumeration;
import java.util.Properties;

/** Standalone no-database tests. Run via test_guard.sh. */
public final class GuardedSqlServerDriverTest {
    private static Properties properties(String login) {
        Properties p = new Properties();
        p.setProperty("user", "sa"); p.setProperty("password", "synthetic-secret");
        p.setProperty("coreanalyticsExecutionLogin", login);
        return p;
    }
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    private static void mustFail(GuardedSqlServerDriver driver, Properties p) throws Exception {
        try { driver.connect("jdbc:sqlserver://example:1433", p); throw new AssertionError("connection should fail"); }
        catch (SQLException error) {
            check("GUARDED_SQL_CONNECTION_UNAVAILABLE".equals(error.getMessage()), "error must be sanitized");
            check(error.getCause() == null, "driver must not expose the cause");
        }
    }
    public static void main(String[] args) throws Exception {
        GuardedSqlServerDriver driver = new GuardedSqlServerDriver();
        Enumeration<Driver> registered = DriverManager.getDrivers();
        while (registered.hasMoreElements()) {
            check(!(registered.nextElement() instanceof GuardedSqlServerDriver),
                  "guard must not register globally and affect ordinary SQL Server connections");
        }
        SQLServerDriver.reset();
        Connection connection = driver.connect("jdbc:sqlserver://example:1433", properties("coreanalytics_reader"));
        check(connection != null, "valid connection expected");
        check(SQLServerDriver.events.indexOf("execute:EXECUTE AS LOGIN = N'coreanalytics_reader' WITH NO REVERT;")
              < SQLServerDriver.events.indexOf("identity-check"), "identity switch precedes permission check");
        check(!SQLServerDriver.received.containsKey("coreanalyticsExecutionLogin"), "private property is not forwarded");
        check("synthetic-secret".equals(SQLServerDriver.received.getProperty("password")), "connection credential is forwarded");
        check(!SQLServerDriver.events.contains("connection-close"), "successful connection stays open for Spark");
        connection.close();

        for (String login : new String[]{"sa", "dbo", "", "bad'; REVERT--"}) {
            SQLServerDriver.reset(); mustFail(driver, properties(login));
            check(!SQLServerDriver.events.contains("connect"), "invalid login must not connect");
        }
        SQLServerDriver.reset(); SQLServerDriver.unsafe = true; mustFail(driver, properties("coreanalytics_reader"));
        check(SQLServerDriver.events.contains("connection-close"), "unsafe principal must close connection");
        SQLServerDriver.reset(); SQLServerDriver.nullPermission = true; mustFail(driver, properties("coreanalytics_reader"));
        check(SQLServerDriver.events.contains("connection-close"), "unknown permission must fail closed");
        SQLServerDriver.reset(); SQLServerDriver.failImpersonation = true; mustFail(driver, properties("coreanalytics_reader"));
        check(SQLServerDriver.events.contains("connection-close"), "failed impersonation must close connection");
        check(driver.connect("jdbc:postgresql://example", properties("coreanalytics_reader")) == null, "other JDBC dialect ignored");
        System.out.println("Guarded JDBC driver tests passed.");
    }
}
